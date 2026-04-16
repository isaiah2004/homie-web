import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// VAPI call queries
export const getVapiCalls = query({
  args: { 
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("initiated"), v.literal("in_progress"), v.literal("completed"), v.literal("failed"))),
  },
  handler: async (ctx, { userId, status }) => {
    let queryBuilder = ctx.db.query("vapiCalls").withIndex("by_user", (q) => q.eq("userId", userId));

    if (status !== undefined) {
      queryBuilder = ctx.db.query("vapiCalls").withIndex("by_user_and_status", (q) => 
        q.eq("userId", userId).eq("status", status)
      );
    }

    const calls = await queryBuilder.order("desc").collect();
    return calls;
  },
});

export const getVapiCallsPaginated = query({
  args: {
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { userId, paginationOpts }) => {
    return await ctx.db
      .query("vapiCalls")
      .withIndex("by_user_and_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const getVapiCallsByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("vapiCalls")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
  },
});

export const getVapiCall = query({
  args: { callId: v.id("vapiCalls") },
  handler: async (ctx, { callId }) => {
    return await ctx.db.get(callId);
  },
});

export const getVapiCallByVapiId = query({
  args: { vapiCallId: v.string() },
  handler: async (ctx, { vapiCallId }) => {
    return await ctx.db
      .query("vapiCalls")
      .filter((q) => q.eq(q.field("vapiCallId"), vapiCallId))
      .unique();
  },
});

export const getActiveVapiCalls = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("vapiCalls")
      .withIndex("by_user_and_status", (q) => 
        q.eq("userId", userId).eq("status", "in_progress")
      )
      .collect();
  },
});

// VAPI call mutations
export const createVapiCall = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    userId: v.id("users"),
    vapiCallId: v.string(),
    phoneNumber: v.optional(v.string()),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  handler: async (ctx, args) => {
    const callId = await ctx.db.insert("vapiCalls", {
      ...args,
      status: "initiated",
      startedAt: Date.now(),
    });
    return callId;
  },
});

export const updateVapiCall = mutation({
  args: {
    callId: v.id("vapiCalls"),
    updates: v.object({
      conversationId: v.optional(v.id("conversations")),
      status: v.optional(v.union(v.literal("initiated"), v.literal("in_progress"), v.literal("completed"), v.literal("failed"))),
      audioUrl: v.optional(v.id("_storage")),
      audioDuration: v.optional(v.number()),
      transcript: v.optional(v.string()),
      endedAt: v.optional(v.number()),
      metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
    }),
  },
  handler: async (ctx, { callId, updates }) => {
    await ctx.db.patch(callId, updates);
    return callId;
  },
});

export const startVapiCall = mutation({
  args: { callId: v.id("vapiCalls") },
  handler: async (ctx, { callId }) => {
    await ctx.db.patch(callId, { status: "in_progress" });
    return callId;
  },
});

export const completeVapiCall = mutation({
  args: { 
    callId: v.id("vapiCalls"),
    audioUrl: v.optional(v.id("_storage")),
    audioDuration: v.optional(v.number()),
    transcript: v.optional(v.string()),
  },
  handler: async (ctx, { callId, audioUrl, audioDuration, transcript }) => {
    await ctx.db.patch(callId, { 
      status: "completed",
      endedAt: Date.now(),
      audioUrl,
      audioDuration,
      transcript,
    });
    return callId;
  },
});

export const failVapiCall = mutation({
  args: { 
    callId: v.id("vapiCalls"),
    transcript: v.optional(v.string()),
  },
  handler: async (ctx, { callId, transcript }) => {
    await ctx.db.patch(callId, { 
      status: "failed",
      endedAt: Date.now(),
      transcript,
    });
    return callId;
  },
});

export const linkVapiCallToConversation = mutation({
  args: {
    callId: v.id("vapiCalls"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { callId, conversationId }) => {
    await ctx.db.patch(callId, { conversationId });
    return callId;
  },
});

export const deleteVapiCall = mutation({
  args: { callId: v.id("vapiCalls") },
  handler: async (ctx, { callId }) => {
    await ctx.db.delete(callId);
    return callId;
  },
});
