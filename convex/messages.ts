import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Messages queries
export const getMessages = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("messages")
      .withIndex("to", (q) => q.eq("to", userId))
      .collect();
  },
});

export const getUnreadMessages = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("messages")
      .withIndex("to", (q) => q.eq("to", userId))
      .filter((q) => q.eq(q.field("read"), false))
      .collect();
  },
});

// Messages mutations
export const sendMessage = mutation({
  args: {
    from: v.id("users"),
    to: v.id("users"),
    content: v.string(),
    type: v.union(v.literal("message"), v.literal("question"), v.literal("request")),
    priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      ...args,
      timestamp: Date.now(),
      read: false,
    });
    return messageId;
  },
});

export const markMessageAsRead = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    await ctx.db.patch(messageId, { read: true });
    return messageId;
  },
});
