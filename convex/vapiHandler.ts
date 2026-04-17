"use node";

// Public Convex action called by the Next.js /api/vapi/webhook route.
// Wraps the internal friend-graph resolution + Qdrant RAG search so the
// webhook route doesn't need direct Qdrant/OpenAI access.

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { SearchHit } from "./embeddings";

type Tier = "close" | "friend";
type Visibility = "close" | "friends" | "mutual" | "none";

function allowedVisibilities(tier: Tier): Visibility[] {
  return tier === "close"
    ? ["close", "friends", "mutual"]
    : ["friends", "mutual"];
}

const toolNameValidator = v.union(
  v.literal("findFriendPlaces"),
  v.literal("findFriendMedia"),
  v.literal("findFriendProjects"),
  v.literal("findFriendInterests"),
);

const TOOL_TO_ENTITY: Record<string, string> = {
  findFriendPlaces: "place",
  findFriendMedia: "media",
  findFriendProjects: "project",
  findFriendInterests: "interest",
};

export const handleToolCall = action({
  args: {
    userId: v.id("users"),
    toolName: toolNameValidator,
    query: v.string(),
    closeOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    placeType: v.optional(v.string()),
    mediaType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SearchHit[]> => {
    const entityType = TOOL_TO_ENTITY[args.toolName];
    if (!entityType) return [];

    // Resolve friend scope (same logic as agentTools.ts)
    const friends: Array<{ id: string; tier: Tier }> = await ctx.runQuery(
      internal.friends.getFriendIdsWithTier,
      { userId: args.userId },
    );

    const closeOnly = args.closeOnly ?? false;
    const scoped = closeOnly
      ? friends.filter((f) => f.tier === "close")
      : friends;

    if (scoped.length === 0) return [];

    const ownerIds = scoped.map((f) => f.id);
    const allowedVisibilityByOwner = scoped.map((f) => ({
      ownerId: f.id,
      allowed: [...allowedVisibilities(f.tier)],
    }));

    // Run the same Qdrant vector search the text chat uses
    const hits: SearchHit[] = await ctx.runAction(
      internal.embeddings.searchProfileItems,
      {
        entityType: entityType as "place" | "media" | "project" | "interest",
        query: args.query,
        ownerIds: ownerIds as any,
        allowedVisibilityByOwner: allowedVisibilityByOwner as any,
        limit: args.limit ?? 8,
      },
    );

    // Post-filter by subtype if provided
    if (args.toolName === "findFriendPlaces" && args.placeType) {
      return hits.filter((h) => h.placeType === args.placeType);
    }
    if (args.toolName === "findFriendMedia" && args.mediaType) {
      return hits.filter((h) => h.mediaType === args.mediaType);
    }

    return hits;
  },
});
