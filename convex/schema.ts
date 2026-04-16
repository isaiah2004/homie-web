import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// User profiles table
export const users = defineTable({
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
}).index("email", ["email"]);

// Friends table
export const friends = defineTable({
  userId: v.id("users"),
  friendId: v.id("users"),
  status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
  addedAt: v.number(),
}).index("userId", ["userId"]).index("friendId", ["friendId"]);

// Messages table
export const messages = defineTable({
  from: v.id("users"),
  to: v.id("users"),
  content: v.string(),
  type: v.union(v.literal("message"), v.literal("question"), v.literal("request")),
  priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  timestamp: v.number(),
  read: v.boolean(),
}).index("to", ["to"]).index("from", ["from"]);

export default defineSchema({
  users,
  friends,
  messages,
});
