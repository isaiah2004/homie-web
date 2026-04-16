import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

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

// Regex used to detect the `@agent` tag anywhere in a message body.
// Case-insensitive, word-boundary guarded to avoid matching `@agentry`.
const AGENT_MENTION = /@agent\b/i;

function hasAgentMention(content: string): boolean {
  return AGENT_MENTION.test(content);
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
// `@agent` mentions only set the pill flag; agent replies travel through
// `askAgent` + `shareAgentResponse`.
export const sendMessage = mutation({
  args: {
    from: v.id("users"),
    to: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, { from, to, content }) => {
    const trimmed = content.trim();
    if (!trimmed) throw new Error("Message cannot be empty");
    await requireFriendship(ctx, from, to);

    const conversationId = await upsertConversation(ctx, from, to);
    const now = Date.now();

    const messageId = await ctx.db.insert("directMessages", {
      conversationId,
      from,
      to,
      content: trimmed,
      author: "user",
      mentionsAgent: hasAgentMention(trimmed),
      sentAt: now,
    });

    await ctx.db.patch(conversationId, {
      lastMessageAt: now,
      lastPreview: trimmed.slice(0, 140),
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
    const cleaned = query.replace(AGENT_MENTION, "").trim();
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
