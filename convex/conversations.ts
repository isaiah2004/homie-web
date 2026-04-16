import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Conversation queries
export const getConversations = query({
  args: { 
    userId: v.id("users"),
    isActive: v.optional(v.boolean()),
    type: v.optional(v.union(v.literal("text"), v.literal("audio"), v.literal("hybrid"))),
  },
  handler: async (ctx, { userId, isActive, type }) => {
    let queryBuilder = ctx.db.query("conversations").withIndex("by_user", (q) => q.eq("userId", userId));

    // Filter by active status if provided
    if (isActive !== undefined) {
      queryBuilder = ctx.db.query("conversations").withIndex("by_user_and_active", (q) => 
        q.eq("userId", userId).eq("isActive", isActive)
      );
    }

    // Filter by type if provided
    if (type !== undefined) {
      queryBuilder = ctx.db.query("conversations").withIndex("by_user_and_type", (q) => 
        q.eq("userId", userId).eq("type", type)
      );
    }

    const conversations = await queryBuilder.order("desc").collect();
    return conversations;
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db.get(conversationId);
  },
});

export const getConversationsWithLastMessage = query({
  args: {
    userId: v.id("users"),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, isActive }) => {
    const base =
      isActive === undefined
        ? ctx.db.query("conversations").withIndex("by_user", (q) => q.eq("userId", userId))
        : ctx.db
            .query("conversations")
            .withIndex("by_user_and_active", (q) =>
              q.eq("userId", userId).eq("isActive", isActive)
            );

    const conversations = await base.order("desc").collect();

    return await Promise.all(
      conversations.map(async (conversation) => {
        const lastMessage = await ctx.db
          .query("conversationMessages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .order("desc")
          .first();
        return { ...conversation, lastMessage };
      })
    );
  },
});

export const getActiveConversations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_and_active", (q) => q.eq("userId", userId).eq("isActive", true))
      .order("desc")
      .collect();
  },
});

// Conversation mutations
export const createConversation = mutation({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
    type: v.union(v.literal("text"), v.literal("audio"), v.literal("hybrid")),
    model: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  handler: async (ctx, args) => {
    const conversationId = await ctx.db.insert("conversations", {
      ...args,
      isActive: true,
    });
    return conversationId;
  },
});

export const updateConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    updates: v.object({
      title: v.optional(v.string()),
      type: v.optional(v.union(v.literal("text"), v.literal("audio"), v.literal("hybrid"))),
      model: v.optional(v.string()),
      systemPrompt: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
    }),
  },
  handler: async (ctx, { conversationId, updates }) => {
    await ctx.db.patch(conversationId, updates);
    return conversationId;
  },
});

export const archiveConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    await ctx.db.patch(conversationId, { isActive: false });
    return conversationId;
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const calls = await ctx.db
      .query("vapiCalls")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    for (const call of calls) {
      await ctx.db.delete(call._id);
    }

    await ctx.db.delete(conversationId);
    return conversationId;
  },
});
