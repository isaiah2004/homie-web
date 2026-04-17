// Helper module — not a Convex function file. Imported by `convex/ai.ts`
// to assemble the AI SDK `tools` object passed to `generateText`.
//
// Each tool resolves the asker's friend graph at execute-time, then delegates
// embedding search to `internal.embeddings.searchProfileItems`. Visibility
// rules (close/friends/mutual) are computed here and forwarded so the search
// action can post-filter retrieved points.

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { SearchHit } from "./embeddings";

type Tier = "close" | "friend";
type Visibility = "close" | "friends" | "mutual" | "none";

// What the asker can read on a friend's profile, given the friendship tier
// the asker has assigned to that friend. Mirror of `friends.canView`.
function allowedVisibilities(tier: Tier): Visibility[] {
  return tier === "close"
    ? ["close", "friends", "mutual"]
    : ["friends", "mutual"];
}

async function resolveFriendScope(
  ctx: ActionCtx,
  askerId: Id<"users">,
  closeOnly: boolean,
): Promise<{
  ownerIds: Id<"users">[];
  allowedVisibilityByOwner: Array<{
    ownerId: Id<"users">;
    allowed: Visibility[];
  }>;
}> {
  const friends: Array<{ id: Id<"users">; tier: Tier }> = await ctx.runQuery(
    internal.friends.getFriendIdsWithTier,
    { userId: askerId },
  );
  const scoped = closeOnly ? friends.filter((f) => f.tier === "close") : friends;
  return {
    ownerIds: scoped.map((f) => f.id),
    allowedVisibilityByOwner: scoped.map((f) => ({
      ownerId: f.id,
      allowed: allowedVisibilities(f.tier),
    })),
  };
}

const placeTypeSchema = z
  .enum([
    "restaurant",
    "cafe",
    "bar",
    "park",
    "gym",
    "library",
    "store",
    "hangout",
    "other",
  ])
  .optional();

const mediaTypeSchema = z
  .enum([
    "music",
    "movie",
    "book",
    "novel",
    "series",
    "podcast",
    "anime",
    "game",
    "other",
  ])
  .optional();

export function buildAgentTools(ctx: ActionCtx, askerId: Id<"users">) {
  return {
    findFriendPlaces: tool({
      description:
        "Search the asker's friends' recommended PLACES (restaurants, cafes, bars, parks, etc). Use this whenever the asker asks for a place to go, eat, hang out, work out, etc. Pass any address or neighborhood the asker mentions verbatim into `query` so the embedding match favors nearby spots.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Free-text description of what they want, e.g. 'good chinese restaurant near 5th Ave'. Include the address if mentioned.",
          ),
        placeType: placeTypeSchema.describe(
          "Optional category filter. Set when the asker is specific (e.g. 'restaurant' for 'place to eat').",
        ),
        closeOnly: z
          .boolean()
          .optional()
          .describe("If true, only search close friends."),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, placeType, closeOnly, limit }) => {
        const scope = await resolveFriendScope(ctx, askerId, closeOnly ?? false);
        const hits: SearchHit[] = await ctx.runAction(
          internal.embeddings.searchProfileItems,
          {
            entityType: "place",
            query,
            ownerIds: scope.ownerIds,
            allowedVisibilityByOwner: scope.allowedVisibilityByOwner,
            limit: limit ?? 8,
          },
        );
        const filtered = placeType
          ? hits.filter((h) => h.placeType === placeType)
          : hits;
        return filtered.map((h) => ({
          name: h.name,
          placeType: h.placeType,
          tags: h.tags,
          mapsLink: h.mapsLink,
          address: h.address,
          recommendedBy: h.ownerName,
          ownerLocation: h.ownerLocation,
          score: h.score,
        }));
      },
    }),

    findFriendMedia: tool({
      description:
        "Search the asker's friends' recommended MEDIA (movies, games, books, anime, music, etc). Use for queries like 'a good action game my friends like' or 'sci-fi book recommendations'.",
      inputSchema: z.object({
        query: z.string().describe("What kind of media they're looking for."),
        mediaType: mediaTypeSchema.describe(
          "Optional category filter (e.g. 'game' for 'action game').",
        ),
        closeOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, mediaType, closeOnly, limit }) => {
        const scope = await resolveFriendScope(ctx, askerId, closeOnly ?? false);
        const hits: SearchHit[] = await ctx.runAction(
          internal.embeddings.searchProfileItems,
          {
            entityType: "media",
            query,
            ownerIds: scope.ownerIds,
            allowedVisibilityByOwner: scope.allowedVisibilityByOwner,
            limit: limit ?? 8,
          },
        );
        const filtered = mediaType
          ? hits.filter((h) => h.mediaType === mediaType)
          : hits;
        return filtered.map((h) => ({
          title: h.title,
          mediaType: h.mediaType,
          recommendedBy: h.ownerName,
          score: h.score,
        }));
      },
    }),

    findFriendProjects: tool({
      description:
        "Search the asker's friends' side PROJECTS. Use when the asker is looking for what their friends are building, want to collaborate, or want examples of work in a domain.",
      inputSchema: z.object({
        query: z.string().describe("Project topic, tech, or domain."),
        closeOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, closeOnly, limit }) => {
        const scope = await resolveFriendScope(ctx, askerId, closeOnly ?? false);
        const hits: SearchHit[] = await ctx.runAction(
          internal.embeddings.searchProfileItems,
          {
            entityType: "project",
            query,
            ownerIds: scope.ownerIds,
            allowedVisibilityByOwner: scope.allowedVisibilityByOwner,
            limit: limit ?? 8,
          },
        );
        return hits.map((h) => ({
          title: h.title,
          description: h.description,
          tags: h.tags,
          ownerName: h.ownerName,
          score: h.score,
        }));
      },
    }),

    findFriendInterests: tool({
      description:
        "Search the asker's friends' INTERESTS (free-text tags people put on their profile). Use for 'who shares my interest in X' or 'who would like to do Y with me'.",
      inputSchema: z.object({
        query: z.string().describe("The interest or activity to match."),
        closeOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, closeOnly, limit }) => {
        const scope = await resolveFriendScope(ctx, askerId, closeOnly ?? false);
        const hits: SearchHit[] = await ctx.runAction(
          internal.embeddings.searchProfileItems,
          {
            entityType: "interest",
            query,
            ownerIds: scope.ownerIds,
            allowedVisibilityByOwner: scope.allowedVisibilityByOwner,
            limit: limit ?? 8,
          },
        );
        return hits.map((h) => ({
          interest: h.value,
          ownerName: h.ownerName,
          score: h.score,
        }));
      },
    }),
  };
}
