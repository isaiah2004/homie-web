import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";
import { assertMembership } from "./groupChats";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const HOMIE_MENTION = /(@homie|@agent)\b/i;

function hasHomieMention(content: string): boolean {
  return HOMIE_MENTION.test(content);
}

async function resolveViewerId(
  ctx: QueryCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique();
  if (!user) throw new Error("User not found for identity");
  return user._id;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export const listMessages = query({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.groupChatId, viewerId);

    const cap = Math.min(args.limit ?? 200, 500);
    return await ctx.db
      .query("groupChatMessages")
      .withIndex("by_group_and_sentAt", (q) =>
        q.eq("groupChatId", args.groupChatId),
      )
      .order("asc")
      .take(cap);
  },
});

// Private + shared agent responses authored by the caller in this group.
// The UI should filter out anything with `sharedAsMessageId` set (those
// are already in the main thread) when rendering the private homie drawer.
export const listAgentResponses = query({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.groupChatId, viewerId);

    const cap = Math.min(args.limit ?? 20, 100);
    return await ctx.db
      .query("groupChatAgentResponses")
      .withIndex("by_group_and_asker", (q) =>
        q
          .eq("groupChatId", args.groupChatId)
          .eq("askerId", viewerId),
      )
      .order("desc")
      .take(cap);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Send a user-authored message to a group. Membership gated and attachment
// ownership validated. `mentionsHomie` is computed server-side using the
// plainText if available (HTML bodies need tags stripped to find the token).
export const sendGroupMessage = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    content: v.string(),
    format: v.union(
      v.literal("plain"),
      v.literal("markdown"),
      v.literal("html"),
    ),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    plainText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.groupChatId, viewerId);

    const rawContent = args.content ?? "";
    const normalizedContent =
      args.format === "html" ? rawContent : rawContent.trim();

    const hasBody =
      args.format === "html"
        ? (args.plainText?.trim().length ?? 0) > 0 ||
          stripHtmlTags(normalizedContent).length > 0
        : normalizedContent.length > 0;
    const hasAttachments = (args.attachmentIds?.length ?? 0) > 0;
    if (!hasBody && !hasAttachments) {
      throw new Error("Message cannot be empty");
    }

    // Validate attachment ownership so a member can't reference someone
    // else's upload in a group message.
    if (args.attachmentIds && args.attachmentIds.length > 0) {
      for (const aid of args.attachmentIds) {
        const attachment = await ctx.db.get(aid);
        if (!attachment) throw new Error("Attachment not found");
        if (attachment.userId !== viewerId) {
          throw new Error("Cannot attach someone else's file");
        }
      }
    }

    const mentionSource =
      args.format === "html"
        ? args.plainText ?? stripHtmlTags(normalizedContent)
        : normalizedContent;

    const now = Date.now();
    const messageId = await ctx.db.insert("groupChatMessages", {
      groupChatId: args.groupChatId,
      from: viewerId,
      author: "user",
      content: normalizedContent,
      format: args.format,
      attachmentIds: args.attachmentIds,
      mentionsHomie: hasHomieMention(mentionSource),
      sentAt: now,
      readBy: [{ userId: viewerId, readAt: now }],
    });

    const previewSource =
      args.plainText ?? stripHtmlTags(normalizedContent);
    const preview =
      previewSource.length > 0
        ? previewSource.slice(0, 140)
        : hasAttachments
          ? "📎 Attachment"
          : "";
    await ctx.db.patch(args.groupChatId, {
      lastMessageAt: now,
      lastPreview: preview,
    });

    return messageId;
  },
});

// Trigger an agent query against the group. Creates a pending
// groupChatAgentResponses row and schedules the Node action that picks a
// skill and runs it. `replyMode === "group"` means the response is
// auto-shared once ready; `"private"` keeps it in the caller's drawer.
export const askGroupAgent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    query: v.string(),
    replyMode: v.union(v.literal("private"), v.literal("group")),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.groupChatId, viewerId);

    const cleaned = args.query.replace(/(@homie|@agent)\b/gi, "").trim();
    if (!cleaned) throw new Error("Ask the agent something");

    const now = Date.now();
    const responseId = await ctx.db.insert("groupChatAgentResponses", {
      groupChatId: args.groupChatId,
      askerId: viewerId,
      query: cleaned,
      content: "",
      status: "pending",
      replyMode: args.replyMode,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.groupChatAgent.handleGroupAgentRequest,
      {
        responseId,
        groupChatId: args.groupChatId,
        askerId: viewerId,
        query: cleaned,
        replyMode: args.replyMode,
      },
    );

    return responseId;
  },
});

// Post a private agent response as a group message. The response must be
// owned by the caller and must not already be shared.
export const shareGroupAgentResponse = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    responseId: v.id("groupChatAgentResponses"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const response = await ctx.db.get(args.responseId);
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

    await assertMembership(ctx, response.groupChatId, viewerId);

    const now = Date.now();
    const messageId = await ctx.db.insert("groupChatMessages", {
      groupChatId: response.groupChatId,
      from: viewerId,
      author: "agent",
      content: response.content,
      format: "markdown",
      mentionsHomie: false,
      sentAt: now,
      readBy: [{ userId: viewerId, readAt: now }],
    });

    await ctx.db.patch(response.groupChatId, {
      lastMessageAt: now,
      lastPreview: `🤖 ${response.content.slice(0, 120)}`,
    });
    await ctx.db.patch(args.responseId, { sharedAsMessageId: messageId });

    return messageId;
  },
});

// Caller discards their own private agent response.
export const dismissGroupAgentResponse = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    responseId: v.id("groupChatAgentResponses"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const response = await ctx.db.get(args.responseId);
    if (!response) return;
    if (response.askerId !== viewerId) {
      throw new Error("Only the asker can dismiss this response");
    }
    if (response.sharedAsMessageId) {
      throw new Error("Already shared — cannot dismiss");
    }
    await ctx.db.delete(args.responseId);
  },
});

// Invoked by the Node action in groupChatAgent.ts to patch an agent
// response row once the skill has completed. If `replyMode === "group"`
// and the status is "ready", the response is auto-posted as a group
// message (author="agent") and linked via `sharedAsMessageId`.
export const finalizeGroupAgentResponse = internalMutation({
  args: {
    responseId: v.id("groupChatAgentResponses"),
    status: v.union(v.literal("ready"), v.literal("failed")),
    content: v.optional(v.string()),
    skillUsed: v.optional(
      v.union(
        v.literal("findHangout"),
        v.literal("pickMovie"),
        v.literal("scheduleEvent"),
        v.literal("general"),
      ),
    ),
    toolResults: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const response = await ctx.db.get(args.responseId);
    if (!response) return;
    await ctx.db.patch(args.responseId, {
      status: args.status,
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.skillUsed !== undefined
        ? { skillUsed: args.skillUsed }
        : {}),
      ...(args.toolResults !== undefined
        ? { toolResults: args.toolResults }
        : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
    });

    if (
      args.status === "ready" &&
      response.replyMode === "group" &&
      args.content !== undefined &&
      args.content.length > 0
    ) {
      const now = Date.now();
      const messageId = await ctx.db.insert("groupChatMessages", {
        groupChatId: response.groupChatId,
        from: response.askerId,
        author: "agent",
        content: args.content,
        format: "markdown",
        mentionsHomie: false,
        sentAt: now,
        readBy: [{ userId: response.askerId, readAt: now }],
      });
      await ctx.db.patch(response.groupChatId, {
        lastMessageAt: now,
        lastPreview: `🤖 ${args.content.slice(0, 120)}`,
      });
      await ctx.db.patch(args.responseId, {
        sharedAsMessageId: messageId,
      });
    }
  },
});

// Mark every message in the group that the caller hasn't already
// acknowledged as read. Bounded at 200 messages per call; for a 15-person
// group this covers the full unread window on any reasonable cadence.
export const markGroupRead = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.groupChatId, viewerId);

    const recent = await ctx.db
      .query("groupChatMessages")
      .withIndex("by_group_and_sentAt", (q) =>
        q.eq("groupChatId", args.groupChatId),
      )
      .order("desc")
      .take(200);
    const now = Date.now();
    let patched = 0;
    for (const msg of recent) {
      if (msg.from === viewerId) continue;
      if (msg.readBy.some((r) => r.userId === viewerId)) continue;
      await ctx.db.patch(msg._id, {
        readBy: [...msg.readBy, { userId: viewerId, readAt: now }],
      });
      patched++;
    }
    return patched;
  },
});

// Forward a DM to a group. The caller must be a member of the target group
// and either `from` or `to` on the source message. Content/format/attachment
// ids are copied verbatim; the `forwardedFrom*` columns link back so the UI
// can show provenance. Replaces the `from` with the forwarder so permissions
// around attachment ownership still make sense.
export const forwardDmToGroup = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    sourceMessageId: v.id("directMessages"),
    targetGroupId: v.id("groupChats"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.targetGroupId, viewerId);

    const source = await ctx.db.get(args.sourceMessageId);
    if (!source) throw new Error("Source message not found");
    if (source.from !== viewerId && source.to !== viewerId) {
      throw new Error("You can only forward your own messages");
    }

    const now = Date.now();
    const preview =
      (source.format === "html"
        ? stripHtmlTags(source.content)
        : source.content
      ).slice(0, 140) || (source.attachmentIds?.length ? "📎 Attachment" : "");

    const messageId = await ctx.db.insert("groupChatMessages", {
      groupChatId: args.targetGroupId,
      from: viewerId,
      author: "user",
      content: source.content,
      format: source.format ?? "plain",
      attachmentIds: source.attachmentIds,
      mentionsHomie: false,
      forwardedFromMessageId: source._id,
      forwardedFromUserId: source.from,
      sentAt: now,
      readBy: [{ userId: viewerId, readAt: now }],
    });

    await ctx.db.patch(args.targetGroupId, {
      lastMessageAt: now,
      lastPreview: preview,
    });

    return messageId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal queries (consumed by groupChatAgent.ts)
// ─────────────────────────────────────────────────────────────────────────────

// Returns the last N messages as plain-text-ish strings, used by the
// scheduleEvent skill to extract a date/time/place from recent chat.
export const lastMessagesInternal = internalQuery({
  args: {
    groupChatId: v.id("groupChats"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { groupChatId, limit }) => {
    const cap = Math.min(limit ?? 5, 25);
    const rows = await ctx.db
      .query("groupChatMessages")
      .withIndex("by_group_and_sentAt", (q) =>
        q.eq("groupChatId", groupChatId),
      )
      .order("desc")
      .take(cap);
    // Oldest-first so the prompt reads as a natural transcript.
    const ordered = [...rows].reverse();
    const withNames: Array<{
      fromName: string;
      plainText: string;
      sentAt: number;
    }> = [];
    for (const m of ordered) {
      const user = await ctx.db.get(m.from);
      const plainText =
        m.format === "html" ? stripHtmlTags(m.content) : m.content;
      withNames.push({
        fromName: user?.name ?? "Someone",
        plainText,
        sentAt: m.sentAt,
      });
    }
    return withNames;
  },
});

// Internal read: returns the response row for skill dispatch. Used so the
// action can check `replyMode` without re-passing it through args.
export const getAgentResponseInternal = internalQuery({
  args: { responseId: v.id("groupChatAgentResponses") },
  handler: async (ctx, { responseId }) => {
    return await ctx.db.get(responseId);
  },
});

// Internal: group summary (name + member user ids) for agent skills.
export const getGroupSummaryInternal = internalQuery({
  args: { groupChatId: v.id("groupChats") },
  handler: async (ctx, { groupChatId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group) return null;
    const members = await ctx.db
      .query("groupChatMembers")
      .withIndex("by_group", (q) => q.eq("groupChatId", groupChatId))
      .collect();
    return {
      group,
      memberUserIds: members.map((m) => m.userId),
    };
  },
});

