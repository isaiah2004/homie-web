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
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { SearchHit } from "./embeddings";
import { googlePlacesTextSearch } from "./lib/googlePlaces";

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

// ─────────────────────────────────────────────────────────────────────────────
// Rich-UI tool catalog
//
// These are the tools wired up to the main Homie chat (not the DM/group
// agents). Each tool returns a JSON-serialisable object shaped for a
// specific React card component so the UI can render without additional
// parsing. When you add/rename a tool here, also update:
//   1. components/chat/tool-cards/ToolPartRenderer.tsx — the switch that
//      maps toolName → card.
//   2. The system prompt in convex/ai.ts — tell the model when to call it.
// ─────────────────────────────────────────────────────────────────────────────

const socialMediaDomainSchema = z.enum([
  "music",
  "movie",
  "book",
  "novel",
  "series",
  "podcast",
  "anime",
  "game",
]);

const providerSchema = z.enum([
  "spotify",
  "itunes",
  "tvmaze",
  "openlibrary",
  "jikan",
  "cheapshark",
]);

export function buildChatTools(ctx: ActionCtx, askerId: Id<"users">) {
  return {
    // Keep the legacy embedding-based tools — they still work and give
    // natural-language scoped search.
    ...buildAgentTools(ctx, askerId),

    // ──────────────────────────────────────────────
    // Social / friend graph
    // ──────────────────────────────────────────────

    findFriendsWithSharedMedia: tool({
      description:
        "Find friends whose profile has overlapping items with the asker's profile (music, movies, books, games, anime, series). Use when the asker asks 'which of my friends likes the same X as me' or similar. You can filter by `domain` (media type) and optional `provider`.",
      inputSchema: z.object({
        domain: socialMediaDomainSchema.describe(
          "Type of media to intersect. Use 'music' for songs/albums/artists (Spotify), 'movie' for films, 'book' for books/novels, 'game' for video games, 'anime' for anime, 'series' for TV shows.",
        ),
        provider: providerSchema
          .optional()
          .describe(
            "Optional provider filter. Set to 'spotify' for music, 'jikan' for anime, etc, to restrict overlap to provider-backed items only.",
          ),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ domain, provider, limit }) => {
        const rows: Array<{
          friendId: Id<"users">;
          friendName: string;
          friendUsername: string | null;
          friendAvatar: string | null;
          sharedItems: Array<{
            title: string;
            type: string;
            subtitle: string | null;
            imageUrl: string | null;
            externalSource: string | null;
            externalId: string | null;
          }>;
        }> = await ctx.runQuery(
          internal.friends.listFriendsWithMediaOverlapInternal,
          {
            askerId,
            mediaType: domain,
            externalSource: provider,
            limit: limit ?? 10,
          },
        );
        return { domain, provider: provider ?? null, friends: rows };
      },
    }),

    findFriendsInCommunity: tool({
      description:
        "List the asker's accepted friends who are ALSO members of a given community. Call `findCommunityByName` first if you only have a name.",
      inputSchema: z.object({
        communityId: z.string().describe("Convex id of the community."),
      }),
      execute: async ({ communityId }) => {
        const rows: Array<{
          friendId: Id<"users">;
          role: "admin" | "moderator" | "announcer" | "member";
          friendName: string;
          friendUsername: string | null;
          friendAvatar: string | null;
        }> = await ctx.runQuery(
          internal.friends.listFriendsInCommunityInternal,
          {
            askerId,
            communityId: communityId as Id<"communities">,
          },
        );
        return { communityId, friends: rows };
      },
    }),

    // ──────────────────────────────────────────────
    // Communities
    // ──────────────────────────────────────────────

    listMyCommunities: tool({
      description:
        "List the communities the asker is a member of, with role. Use when the asker asks 'what communities am I in' or needs to pick one.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await ctx.runQuery(
          internal.communities.listMyCommunitiesInternal,
          { askerId },
        );
        return { communities: rows };
      },
    }),

    findCommunityByName: tool({
      description:
        "Find a community the asker is a member of whose name matches the given query substring. Use to resolve a natural-language community reference ('my running group', 'the chess club') into an id before calling community-scoped tools.",
      inputSchema: z.object({
        query: z.string().describe("Name fragment to match."),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, limit }) => {
        const rows = await ctx.runQuery(
          internal.communities.findCommunityByNameForUserInternal,
          { askerId, query, limit },
        );
        return { query, communities: rows };
      },
    }),

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    getEventRsvpSummary: tool({
      description:
        "Get the RSVP summary for an event (accepted/declined/maybe/pending counts + attendee preview). Use when the asker asks 'how many people have confirmed', 'who is coming', or similar.",
      inputSchema: z.object({
        eventId: z.string().describe("Convex id of the event."),
      }),
      execute: async ({ eventId }) => {
        const summary = await ctx.runQuery(
          internal.eventInvites.getRsvpSummaryInternal,
          {
            askerId,
            eventId: eventId as Id<"events">,
          },
        );
        if (!summary) return { eventId, error: "not_allowed_or_missing" };
        return summary;
      },
    }),

    listMyUpcomingEvents: tool({
      description:
        "List upcoming events the asker has created or been invited to, within `withinDays` days from now (default 60). Use when the asker asks about their schedule.",
      inputSchema: z.object({
        withinDays: z.number().int().min(1).max(365).optional(),
      }),
      execute: async ({ withinDays }) => {
        const rows = await ctx.runQuery(
          internal.events.listUpcomingForUserInternal,
          { askerId, withinDays },
        );
        return { events: rows };
      },
    }),

    // ──────────────────────────────────────────────
    // Inbox / activity
    // ──────────────────────────────────────────────

    summarizeUnreads: tool({
      description:
        "Summarize the asker's unread DM threads — returns one entry per thread with the other user's info, unread count, and up to 3 message previews. Use when the asker asks 'what unreads do I have', 'summarise my messages', etc.",
      inputSchema: z.object({}),
      execute: async () => {
        const threads = await ctx.runQuery(
          internal.dm.summarizeUnreadsInternal,
          { askerId },
        );
        return { threads };
      },
    }),

    listRecentAnnouncements: tool({
      description:
        "List recent announcements from the communities the asker is a member of. Optionally scope to a single `communityId` (must be one the asker belongs to).",
      inputSchema: z.object({
        communityId: z.string().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ communityId, limit }) => {
        const rows = await ctx.runQuery(
          internal.communityAnnouncements.listRecentForUserInternal,
          {
            askerId,
            communityId: communityId
              ? (communityId as Id<"communities">)
              : undefined,
            limit,
          },
        );
        return { announcements: rows };
      },
    }),

    // ──────────────────────────────────────────────
    // Provider-backed discovery (return rich card data for the UI)
    // ──────────────────────────────────────────────

    searchPlaces: tool({
      description:
        "Search real-world places by text (Google Places). Use whenever the asker asks about places to go, eat, hang out — ALWAYS call this before describing any place in prose so the UI can render rich cards.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Free-text query like 'ramen near soho' or 'quiet bookshop in brooklyn'."),
      }),
      execute: async ({ query }) => {
        const result = await googlePlacesTextSearch(query, {
          maxResultCount: 6,
        });
        if (!result.ok) {
          if (result.reason === "missing_key") {
            return {
              query,
              places: [],
              note: result.note ?? "Google Places key not configured",
            };
          }
          return {
            query,
            places: [],
            error: `places search failed: ${result.status ?? "unknown"}`,
          };
        }
        // Strip the `location` field — the chat card doesn't need it and
        // keeping the chat shape unchanged avoids a UI regression.
        const places = result.places.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          typeLabel: p.typeLabel,
          rating: p.rating,
          ratingCount: p.ratingCount,
          mapsLink: p.mapsLink,
          imageUrl: p.imageUrl,
        }));
        return { query, places };
      },
    }),

    searchSongs: tool({
      description:
        "Search songs / albums / artists on Spotify. Always call this when the asker asks about songs or music so the UI can render clickable, playable cards.",
      inputSchema: z.object({
        query: z.string(),
        kinds: z
          .array(z.enum(["track", "album", "artist", "show"]))
          .optional(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, kinds, limit }) => {
        const results = await ctx.runAction(api.spotify.searchSpotify, {
          query,
          kinds,
          limit: limit ?? 6,
        });
        return { query, results };
      },
    }),

    searchMovies: tool({
      description:
        "Search movies on iTunes. Call whenever the asker wants movie recommendations so the UI can render poster cards.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, limit }) => {
        const results = await ctx.runAction(api.itunes.searchItunes, {
          query,
          limit: limit ?? 6,
        });
        return { query, results };
      },
    }),

    searchBooks: tool({
      description:
        "Search books on Open Library. Call when the asker wants book recommendations.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, limit }) => {
        const results = await ctx.runAction(
          api.openLibrary.searchOpenLibrary,
          { query, limit: limit ?? 6 },
        );
        return { query, results };
      },
    }),

    searchGames: tool({
      description:
        "Search video-game deals via CheapShark. Call when the asker wants game recommendations with pricing.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, limit }) => {
        const results = await ctx.runAction(
          api.cheapShark.searchCheapShark,
          { query, limit: limit ?? 6 },
        );
        return { query, results };
      },
    }),

    searchAnime: tool({
      description:
        "Search anime on MyAnimeList (Jikan). Call when the asker wants anime recommendations.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, limit }) => {
        const results = await ctx.runAction(api.jikan.searchJikan, {
          query,
          limit: limit ?? 6,
        });
        return { query, results };
      },
    }),
  };
}
