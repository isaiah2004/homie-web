import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { getChildPolicy, isInNightLock } from "./_lib/childPolicy";
import { computeAge, withinAllowedBand } from "./_lib/ageBand";
import { ensurePendingRequest, hasApprovedRequest } from "./crossBandRequests";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Deterministic pair ordering so `(a, b)` and `(b, a)` map to the same row.
function sortedPair(
  a: Id<"users">,
  b: Id<"users">,
): { userAId: Id<"users">; userBId: Id<"users"> } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

// Detect the `@homie` tag (and the legacy `@agent` alias) anywhere in a
// message body. Case-insensitive, word-boundary guarded.
const HOMIE_MENTION = /(@homie|@agent)\b/i;

function hasHomieMention(content: string): boolean {
  return HOMIE_MENTION.test(content);
}

async function requireFriendship(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  otherId: Id<"users">,
): Promise<void> {
  if (viewerId === otherId) throw new Error("Cannot chat with yourself");
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", viewerId).eq("friendId", otherId),
    )
    .unique();
  if (!edge || edge.status !== "accepted") {
    throw new Error("You must be accepted friends to chat");
  }
}

// Returns true iff `parentId` is an active guardian of `childId` per
// familyLinks. Used by the adults-cannot-DM-minors gate so a parent is
// always allowed to message their own child even though one side is a
// minor.
async function isActiveGuardianOf(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"users">,
  childId: Id<"users">,
): Promise<boolean> {
  const link = await ctx.db
    .query("familyLinks")
    .withIndex("by_pair", (q) =>
      q.eq("parentUserId", parentId).eq("childUserId", childId),
    )
    .unique();
  return Boolean(link && link.status === "active");
}

// Single-stop child-policy enforcement for DM sends. Order matters:
//   1. Locked accounts can't transmit at all.
//   2. Adults ↔ minors are blocked unless the adult is a guardian.
//   3. Cross-band age pairs need an approved cross-band request.
//   4. Parent-side blocklists override otherwise-allowed sends.
//   5. Night-lock window restricts to close-tier friends and audits the
//      exemption.
// Each branch falls through cleanly when neither side is a child so adult
// DMs are unaffected.
async function enforceDmPolicy(
  ctx: MutationCtx,
  fromId: Id<"users">,
  toId: Id<"users">,
): Promise<void> {
  const now = Date.now();
  const [fromUser, toUser] = await Promise.all([
    ctx.db.get(fromId),
    ctx.db.get(toId),
  ]);
  if (!fromUser || !toUser) throw new Error("User not found");
  const [fromPolicy, toPolicy] = await Promise.all([
    getChildPolicy(ctx, fromId, now),
    getChildPolicy(ctx, toId, now),
  ]);

  // 1. Locked accounts.
  if (fromPolicy?.flags.accountLocked || toPolicy?.flags.accountLocked) {
    throw new Error("Account is locked");
  }

  // 2. Adults cannot DM minors directly. A user is a "minor" here iff they
  // have an active child-account policy (which is the canonical signal —
  // raw DOB alone doesn't make someone supervised). The adult side is
  // exempted only if they're an active guardian of the child via
  // familyLinks.
  const fromIsChild = fromPolicy !== null;
  const toIsChild = toPolicy !== null;
  if (fromIsChild !== toIsChild) {
    const childId = fromIsChild ? fromId : toId;
    const adultId = fromIsChild ? toId : fromId;
    const adultIsGuardian = await isActiveGuardianOf(ctx, adultId, childId);
    if (!adultIsGuardian) {
      throw new Error("Adults cannot DM minors directly");
    }
  }

  // 3. Age-band check. Uses raw DOBs so two adults with mismatched ages
  // remain unconstrained (computeAge → NaN collapses withinAllowedBand to
  // true). Only triggers when both sides have parseable DOBs and the pair
  // crosses the under-12 line OR (both 12+ and gap > 3yr).
  const fromAge = computeAge(fromUser.dob ?? "", now);
  const toAge = computeAge(toUser.dob ?? "", now);
  if (
    !Number.isNaN(fromAge) &&
    !Number.isNaN(toAge) &&
    !withinAllowedBand(fromAge, toAge)
  ) {
    // Only meaningful for child accounts — adults don't have a guardian
    // to approve. Use whichever side is the child.
    const childForReq = fromIsChild ? fromId : toIsChild ? toId : null;
    const otherForReq = fromIsChild ? toId : toIsChild ? fromId : null;
    if (childForReq && otherForReq) {
      const approved = await hasApprovedRequest(
        ctx,
        childForReq,
        otherForReq,
        "dm",
      );
      if (!approved) {
        await ensurePendingRequest(ctx, {
          childId: childForReq,
          otherId: otherForReq,
          scope: "dm",
          reason: "DM outside allowed age band",
        });
        throw new Error(
          "Outside allowed age range — request sent for parent approval",
        );
      }
    }
  }

  // 4. Parent-side blocklists. Either side's guardian may have blocked the
  // other party out-of-band.
  if (fromPolicy && fromPolicy.blockedUserIds.has(toId as unknown as string)) {
    throw new Error("This contact is blocked by a guardian");
  }
  if (toPolicy && toPolicy.blockedUserIds.has(fromId as unknown as string)) {
    throw new Error("This contact is blocked by a guardian");
  }

  // 5. Night lock — only the sender's window matters (the recipient might
  // be in a different timezone / different family). Within the window the
  // sender may still DM close-tier friends (server-checks the sender's own
  // edge so the child can't bypass by re-tagging). Successful close-tier
  // sends inside the window are audited.
  if (fromPolicy && isInNightLock(fromPolicy, now)) {
    const senderEdge = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", fromId).eq("friendId", toId),
      )
      .unique();
    const isClose = senderEdge?.tier === "close";
    if (!isClose) {
      throw new Error("Outside chat hours");
    }
    await ctx.scheduler.runAfter(0, internal.family.internalLogAudit, {
      childUserId: fromId,
      actorUserId: fromId,
      action: "dm_in_night_window",
      meta: { otherUserId: toId, count: 1 },
    });
  }
}

async function getConversationForPair(
  ctx: QueryCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<Doc<"dmConversations"> | null> {
  const { userAId, userBId } = sortedPair(a, b);
  return await ctx.db
    .query("dmConversations")
    .withIndex("by_pair", (q) =>
      q.eq("userAId", userAId).eq("userBId", userBId),
    )
    .unique();
}

async function upsertConversation(
  ctx: MutationCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<Id<"dmConversations">> {
  const existing = await getConversationForPair(ctx, a, b);
  if (existing) return existing._id;
  const { userAId, userBId } = sortedPair(a, b);
  return await ctx.db.insert("dmConversations", {
    userAId,
    userBId,
    lastMessageAt: Date.now(),
  });
}

function otherParticipant(
  conv: Doc<"dmConversations">,
  me: Id<"users">,
): Id<"users"> {
  return conv.userAId === me ? conv.userBId : conv.userAId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// All conversations involving `userId`, newest first, with the other
// participant's user doc attached for convenient sidebar rendering.
export const listConversations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const asA = await ctx.db
      .query("dmConversations")
      .withIndex("by_userA", (q) => q.eq("userAId", userId))
      .collect();
    const asB = await ctx.db
      .query("dmConversations")
      .withIndex("by_userB", (q) => q.eq("userBId", userId))
      .collect();
    const convs = [...asA, ...asB].sort(
      (x, y) => y.lastMessageAt - x.lastMessageAt,
    );
    const enriched = await Promise.all(
      convs.map(async (conv) => {
        const otherId = otherParticipant(conv, userId);
        const other = await ctx.db.get(otherId);
        const unread = await ctx.db
          .query("directMessages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conv._id),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("to"), userId),
              q.eq(q.field("readAt"), undefined),
            ),
          )
          .collect();
        return {
          conversation: conv,
          other,
          unreadCount: unread.length,
        };
      }),
    );
    return enriched;
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id("dmConversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, limit }) => {
    const cap = Math.min(limit ?? 200, 500);
    return await ctx.db
      .query("directMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("asc")
      .take(cap);
  },
});

// Private agent responses for `askerId` in a conversation, newest first.
// Includes both pending (still generating) and ready responses; the UI should
// filter out any with `sharedAsMessageId` set.
export const listAgentResponses = query({
  args: {
    conversationId: v.id("dmConversations"),
    askerId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, askerId, limit }) => {
    const cap = Math.min(limit ?? 20, 100);
    return await ctx.db
      .query("agentChatResponses")
      .withIndex("by_conversation_and_asker", (q) =>
        q.eq("conversationId", conversationId).eq("askerId", askerId),
      )
      .order("desc")
      .take(cap);
  },
});

// Summary of every DM thread with unread messages for `askerId`. For each
// such thread returns the other user's display info, the unread count, and
// a preview (up to 3) of the unread messages. Used by the chat
// `summarizeUnreads` tool — the tool itself composes a natural-language
// summary; this internal query just surfaces the raw rows.
export const summarizeUnreadsInternal = internalQuery({
  args: { askerId: v.id("users") },
  handler: async (ctx, { askerId }) => {
    const asA = await ctx.db
      .query("dmConversations")
      .withIndex("by_userA", (q) => q.eq("userAId", askerId))
      .collect();
    const asB = await ctx.db
      .query("dmConversations")
      .withIndex("by_userB", (q) => q.eq("userBId", askerId))
      .collect();
    const convs = [...asA, ...asB].sort(
      (x, y) => y.lastMessageAt - x.lastMessageAt,
    );

    const threads: Array<{
      conversationId: Id<"dmConversations">;
      other: {
        _id: Id<"users">;
        name: string;
        username: string | null;
        avatar: string | null;
      };
      unreadCount: number;
      previews: Array<{
        from: "them" | "me";
        content: string;
        sentAt: number;
      }>;
      lastMessageAt: number;
    }> = [];

    for (const conv of convs) {
      const otherId = otherParticipant(conv, askerId);
      const other = await ctx.db.get(otherId);
      if (!other) continue;
      const unread = await ctx.db
        .query("directMessages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conv._id),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("to"), askerId),
            q.eq(q.field("readAt"), undefined),
          ),
        )
        .collect();
      if (unread.length === 0) continue;
      // Strip HTML-ish wrapping from preview content. This is a best-effort
      // plain-text rendering — the actual chat UI still honours the stored
      // format field on click-through.
      const previewSlice = unread.slice(-3).map((m) => ({
        from: (m.from === askerId ? "me" : "them") as "me" | "them",
        content: m.content
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240),
        sentAt: m.sentAt,
      }));
      threads.push({
        conversationId: conv._id,
        other: {
          _id: other._id,
          name: other.name,
          username: other.username ?? null,
          avatar: other.avatar ?? null,
        },
        unreadCount: unread.length,
        previews: previewSlice,
        lastMessageAt: conv.lastMessageAt,
      });
    }
    return threads;
  },
});

// Resolve or peek a conversation for a pair without creating one (useful for
// the chat page to read state before the first message is sent).
export const getConversationWithUser = query({
  args: {
    viewerId: v.id("users"),
    otherId: v.id("users"),
  },
  handler: async (ctx, { viewerId, otherId }) => {
    return await getConversationForPair(ctx, viewerId, otherId);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Idempotent conversation opener. Requires an accepted friendship.
export const openConversation = mutation({
  args: {
    viewerId: v.id("users"),
    otherId: v.id("users"),
  },
  handler: async (ctx, { viewerId, otherId }) => {
    await requireFriendship(ctx, viewerId, otherId);
    return await upsertConversation(ctx, viewerId, otherId);
  },
});

// Send a human-authored message. Never emits an agent-authored row on its own —
// `@homie` mentions only set the pill flag; agent replies travel through
// `askAgent` + `shareAgentResponse`.
export const sendMessage = mutation({
  args: {
    from: v.id("users"),
    to: v.id("users"),
    content: v.string(),
    format: v.optional(
      v.union(
        v.literal("plain"),
        v.literal("markdown"),
        v.literal("html"),
      ),
    ),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    plainText: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { from, to, content, format, attachmentIds, plainText },
  ) => {
    await requireFriendship(ctx, from, to);
    await enforceDmPolicy(ctx, from, to);

    // Normalize content. Server-side DOMPurify sanitize is NOT run here —
    // isomorphic-dompurify fails to init inside the Convex V8 isolate
    // (needs either Node's jsdom or the browser DOM). We rely on:
    //   1. Tiptap's vocabulary is already constrained (no raw HTML input),
    //   2. `components/chat/message-content.tsx` sanitizes every HTML
    //      payload with DOMPurify right before `dangerouslySetInnerHTML`.
    // Defense-in-depth will be restored when we either (a) port sanitize
    // to a "use node" action that wraps `sendMessage`, or (b) ship a
    // pure-JS sanitizer compatible with the V8 runtime.
    const rawContent = content ?? "";
    const normalizedContent =
      format === "html" ? rawContent : rawContent.trim();

    // Require at least one of: non-empty content OR at least one attachment.
    // For HTML format we check the stripped text length so that bare
    // `<p></p>` whitespace alone isn't counted as content.
    const hasBody =
      format === "html"
        ? (plainText?.trim().length ?? 0) > 0 ||
          normalizedContent.replace(/<[^>]+>/g, "").trim().length > 0
        : normalizedContent.length > 0;
    const hasAttachments = (attachmentIds?.length ?? 0) > 0;
    if (!hasBody && !hasAttachments) {
      throw new Error("Message cannot be empty");
    }

    // Validate attachment ownership to prevent referencing someone else's
    // upload. (Attachments themselves are public once in R2, but we don't
    // want other users' files to appear in a conversation's DM log.)
    if (attachmentIds && attachmentIds.length > 0) {
      for (const aid of attachmentIds) {
        const attachment = await ctx.db.get(aid);
        if (!attachment) throw new Error("Attachment not found");
        if (attachment.userId !== from) {
          throw new Error("Cannot attach someone else's file");
        }
      }
    }

    const conversationId = await upsertConversation(ctx, from, to);
    const now = Date.now();

    const mentionSource =
      format === "html"
        ? (plainText ?? normalizedContent.replace(/<[^>]+>/g, " "))
        : normalizedContent;

    const messageId = await ctx.db.insert("directMessages", {
      conversationId,
      from,
      to,
      content: normalizedContent,
      author: "user",
      mentionsAgent: hasHomieMention(mentionSource),
      format,
      attachmentIds,
      sentAt: now,
    });

    const previewSource =
      plainText ?? normalizedContent.replace(/<[^>]+>/g, "").trim();
    const preview =
      previewSource.length > 0
        ? previewSource.slice(0, 140)
        : hasAttachments
          ? "📎 Attachment"
          : "";

    await ctx.db.patch(conversationId, {
      lastMessageAt: now,
      lastPreview: preview,
    });

    return { conversationId, messageId };
  },
});

// Trigger a private agent query. Creates a `pending` row in
// `agentChatResponses` and schedules the Node action to fill it in.
export const askAgent = mutation({
  args: {
    askerId: v.id("users"),
    otherId: v.id("users"),
    query: v.string(),
  },
  handler: async (ctx, { askerId, otherId, query }) => {
    // Strip the mention token(s) before sending to the model so the agent
    // doesn't echo "you tagged me" and so both `@homie` and `@agent`
    // aliases work identically.
    const cleaned = query.replace(/(@homie|@agent)\b/gi, "").trim();
    if (!cleaned) throw new Error("Ask the agent something");
    await requireFriendship(ctx, askerId, otherId);

    const conversationId = await upsertConversation(ctx, askerId, otherId);
    const now = Date.now();

    const responseId = await ctx.db.insert("agentChatResponses", {
      conversationId,
      askerId,
      query: cleaned,
      content: "",
      status: "pending",
      createdAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.dmAgent.generateAgentResponse,
      {
        responseId,
        askerId,
        query: cleaned,
      },
    );

    return { conversationId, responseId };
  },
});

// Share a private agent response into the real chat. Inserts a
// directMessages row with `author: "agent"` and links it back.
export const shareAgentResponse = mutation({
  args: {
    viewerId: v.id("users"),
    responseId: v.id("agentChatResponses"),
  },
  handler: async (ctx, { viewerId, responseId }) => {
    const response = await ctx.db.get(responseId);
    if (!response) throw new Error("Response not found");
    if (response.askerId !== viewerId) {
      throw new Error("Only the asker can share this response");
    }
    if (response.status !== "ready") {
      throw new Error("Response is not ready yet");
    }
    if (response.sharedAsMessageId) {
      throw new Error("Already shared");
    }

    const conv = await ctx.db.get(response.conversationId);
    if (!conv) throw new Error("Conversation missing");
    const otherId = otherParticipant(conv, viewerId);

    const now = Date.now();
    const messageId = await ctx.db.insert("directMessages", {
      conversationId: response.conversationId,
      from: viewerId,
      to: otherId,
      content: response.content,
      author: "agent",
      mentionsAgent: false,
      format: "markdown",
      sentAt: now,
    });
    await ctx.db.patch(response.conversationId, {
      lastMessageAt: now,
      lastPreview: `🤖 ${response.content.slice(0, 120)}`,
    });
    await ctx.db.patch(responseId, { sharedAsMessageId: messageId });

    return messageId;
  },
});

// Discard a private agent response without sharing it.
export const dismissAgentResponse = mutation({
  args: {
    viewerId: v.id("users"),
    responseId: v.id("agentChatResponses"),
  },
  handler: async (ctx, { viewerId, responseId }) => {
    const response = await ctx.db.get(responseId);
    if (!response) return;
    if (response.askerId !== viewerId) {
      throw new Error("Only the asker can dismiss this response");
    }
    if (response.sharedAsMessageId) {
      throw new Error("Already shared — cannot dismiss");
    }
    await ctx.db.delete(responseId);
  },
});

// Invoked by the Node action in dmAgent.ts to patch an agent response row.
// Kept here (non-Node file) because the Convex runtime forbids mutations in
// files marked `"use node"`.
export const finalizeAgentResponse = internalMutation({
  args: {
    responseId: v.id("agentChatResponses"),
    status: v.union(v.literal("ready"), v.literal("failed")),
    content: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { responseId, status, content, error }) => {
    await ctx.db.patch(responseId, {
      status,
      ...(content !== undefined ? { content } : {}),
      ...(error !== undefined ? { error } : {}),
    });
  },
});

// Mark every unread message addressed to `userId` in this conversation as read.
export const markConversationRead = mutation({
  args: {
    conversationId: v.id("dmConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, { conversationId, userId }) => {
    const unread = await ctx.db
      .query("directMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("to"), userId),
          q.eq(q.field("readAt"), undefined),
        ),
      )
      .collect();
    const now = Date.now();
    for (const m of unread) {
      await ctx.db.patch(m._id, { readAt: now });
    }
    return unread.length;
  },
});
