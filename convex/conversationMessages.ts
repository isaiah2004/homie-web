import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// Conversation message queries
export const getMessages = query({
  args: { 
    conversationId: v.id("conversations"),
    role: v.optional(v.union(v.literal("user"), v.literal("assistant"), v.literal("system"))),
  },
  handler: async (ctx, { conversationId, role }) => {
    let queryBuilder = ctx.db.query("conversationMessages").withIndex("by_conversation", (q) => 
      q.eq("conversationId", conversationId)
    );

    if (role !== undefined) {
      queryBuilder = ctx.db.query("conversationMessages").withIndex("by_conversation_and_role", (q) => 
        q.eq("conversationId", conversationId).eq("role", role)
      );
    }

    const messages = await queryBuilder.order("asc").collect();
    
    return messages;
  },
});

export const getMessagesPaginated = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { conversationId, paginationOpts }) => {
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("asc")
      .paginate(paginationOpts);
  },
});

export const getUserMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation_and_role", (q) => 
        q.eq("conversationId", conversationId).eq("role", "user")
      )
      .order("asc")
      .collect();
  },
});

export const getAssistantMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation_and_role", (q) => 
        q.eq("conversationId", conversationId).eq("role", "assistant")
      )
      .order("asc")
      .collect();
  },
});

export const getMessage = query({
  args: { messageId: v.id("conversationMessages") },
  handler: async (ctx, { messageId }) => {
    return await ctx.db.get(messageId);
  },
});

// Conversation message mutations
export const createMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      type: v.union(v.literal("image"), v.literal("file")),
      url: v.string(),
      name: v.optional(v.string()),
    }))),
    model: v.optional(v.string()),
    tokens: v.optional(v.object({
      prompt: v.optional(v.number()),
      completion: v.optional(v.number()),
      total: v.optional(v.number()),
    })),
    finishReason: v.optional(v.string()),
    toolCalls: v.optional(v.array(v.object({
      name: v.string(),
      arguments: v.string(),
    }))),
    parts: v.optional(
      v.array(
        v.object({
          type: v.string(),
          text: v.optional(v.string()),
          toolName: v.optional(v.string()),
          toolCallId: v.optional(v.string()),
          input: v.optional(v.string()),
          output: v.optional(v.string()),
          state: v.optional(
            v.union(
              v.literal("input-available"),
              v.literal("output-available"),
              v.literal("output-error"),
            ),
          ),
          errorText: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("conversationMessages", args);
    return messageId;
  },
});

export const updateMessage = mutation({
  args: {
    messageId: v.id("conversationMessages"),
    updates: v.object({
      content: v.optional(v.string()),
      attachments: v.optional(v.array(v.object({
        type: v.union(v.literal("image"), v.literal("file")),
        url: v.string(),
        name: v.optional(v.string()),
      }))),
      model: v.optional(v.string()),
      tokens: v.optional(v.object({
        prompt: v.optional(v.number()),
        completion: v.optional(v.number()),
        total: v.optional(v.number()),
      })),
      finishReason: v.optional(v.string()),
      toolCalls: v.optional(v.array(v.object({
        name: v.string(),
        arguments: v.string(),
      }))),
    }),
  },
  handler: async (ctx, { messageId, updates }) => {
    await ctx.db.patch(messageId, updates);
    return messageId;
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("conversationMessages") },
  handler: async (ctx, { messageId }) => {
    await ctx.db.delete(messageId);
    return messageId;
  },
});

// Helper mutation to add AI metadata after message creation
export const addAIMetadata = mutation({
  args: {
    messageId: v.id("conversationMessages"),
    model: v.string(),
    tokens: v.object({
      prompt: v.optional(v.number()),
      completion: v.optional(v.number()),
      total: v.optional(v.number()),
    }),
    finishReason: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, model, tokens, finishReason }) => {
    await ctx.db.patch(messageId, { model, tokens, finishReason });
    return messageId;
  },
});
