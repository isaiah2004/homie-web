import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// User queries
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

// User mutations
export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    media: v.optional(v.array(v.string())),
    places: v.optional(v.array(v.string())),
    projects: v.optional(v.array(v.string())),
    workplace: v.optional(v.object({
      name: v.string(),
      position: v.string(),
      googleMapsLink: v.optional(v.string()),
    })),
    school: v.optional(v.object({
      name: v.string(),
      degree: v.string(),
      googleMapsLink: v.optional(v.string()),
    })),
    profileVisibility: v.optional(v.string()),
    currentStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", args);
    return userId;
  },
});

export const updateUser = mutation({
  args: { 
    userId: v.id("users"),
    updates: v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      avatar: v.optional(v.string()),
      bio: v.optional(v.string()),
      location: v.optional(v.string()),
      interests: v.optional(v.array(v.string())),
      media: v.optional(v.array(v.string())),
      places: v.optional(v.array(v.string())),
      projects: v.optional(v.array(v.string())),
      workplace: v.optional(v.object({
        name: v.optional(v.string()),
        position: v.optional(v.string()),
        googleMapsLink: v.optional(v.string()),
      })),
      school: v.optional(v.object({
        name: v.optional(v.string()),
        degree: v.optional(v.string()),
        googleMapsLink: v.optional(v.string()),
      })),
      profileVisibility: v.optional(v.string()),
      currentStatus: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { userId, updates }) => {
    const { workplace, school, ...restUpdates } = updates;
    const patchData: any = restUpdates;
    
    if (workplace) {
      patchData.workplace = {
        name: workplace.name || "",
        position: workplace.position || "",
        googleMapsLink: workplace.googleMapsLink,
      };
    }
    
    if (school) {
      patchData.school = {
        name: school.name || "",
        degree: school.degree || "",
        googleMapsLink: school.googleMapsLink,
      };
    }
    
    await ctx.db.patch(userId, patchData);
    return userId;
  },
});

// Friends queries
export const getFriends = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("friends")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getFriendRequests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("friends")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

// Friends mutations
export const sendFriendRequest = mutation({
  args: { 
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
  },
  handler: async (ctx, { fromUserId, toUserId }) => {
    const requestId = await ctx.db.insert("friends", {
      userId: toUserId,
      friendId: fromUserId,
      status: "pending",
      addedAt: Date.now(),
    });
    return requestId;
  },
});

export const acceptFriendRequest = mutation({
  args: { requestId: v.id("friends") },
  handler: async (ctx, { requestId }) => {
    await ctx.db.patch(requestId, { status: "accepted" });
    return requestId;
  },
});

export const declineFriendRequest = mutation({
  args: { requestId: v.id("friends") },
  handler: async (ctx, { requestId }) => {
    await ctx.db.patch(requestId, { status: "declined" });
    return requestId;
  },
});

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
