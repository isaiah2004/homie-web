import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";

// User-facing queries for the Spotify integration.
//
// All profile-viewer queries gate on "viewer is owner OR accepted friend".
// Non-friends see null — the app handles that as "hidden". Finer-grained
// visibility (close-only, mutual-friends, public) is a v2 concern; it would
// hang off new fields on `spotifyConnections` when we get there.

const kindValidator = v.union(
  v.literal("liked"),
  v.literal("recent"),
  v.literal("top_short"),
  v.literal("top_medium"),
  v.literal("top_long"),
);

const MAX_RESULTS = 100;
const DEFAULT_RESULTS = 50;

async function resolveCallerUser(
  ctx: QueryCtx,
  devUserId?: Id<"users">,
): Promise<Doc<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId });
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique();
  if (!user) throw new Error("User row not found for caller");
  return user;
}

async function isViewerAllowed(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  ownerId: Id<"users">,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", ownerId).eq("friendId", viewerId),
    )
    .unique();
  return edge?.status === "accepted";
}

// Shape of a track row returned to the client. Keeping it flat and explicit
// so callers don't have to know about the discriminated schema union.
type ClientTrack = {
  _id: Id<"spotifyUserTracks">;
  spotifyTrackId: string;
  uri: string;
  title: string;
  artists: string;
  albumImageUrl?: string;
  previewUrl?: string;
  playedAt?: number;
  addedAt?: number;
  rank?: number;
};

function toClientTrack(row: Doc<"spotifyUserTracks">): ClientTrack {
  return {
    _id: row._id,
    spotifyTrackId: row.spotifyTrackId,
    uri: row.uri,
    title: row.title,
    artists: row.artists,
    albumImageUrl: row.albumImageUrl,
    previewUrl: row.previewUrl,
    playedAt: row.playedAt,
    addedAt: row.addedAt,
    rank: row.rank,
  };
}

function sortForKind(
  kind: "liked" | "recent" | "top_short" | "top_medium" | "top_long",
  rows: Doc<"spotifyUserTracks">[],
): Doc<"spotifyUserTracks">[] {
  if (kind === "liked") {
    return [...rows].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  }
  if (kind === "recent") {
    return [...rows].sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0));
  }
  return [...rows].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

export const getMyConnection = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const user = await resolveCallerUser(ctx, devUserId);
    const conn = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!conn) {
      return {
        isConnected: false as const,
      };
    }
    // Never expose tokens to the client — just status + freshness.
    return {
      isConnected: true as const,
      spotifyUserId: conn.spotifyUserId,
      scopes: conn.scopes,
      connectedAt: conn.connectedAt,
      lastLikedSyncAt: conn.lastLikedSyncAt,
      lastRecentSyncAt: conn.lastRecentSyncAt,
      lastTopSyncAt: conn.lastTopSyncAt,
      lastNowPlayingAt: conn.lastNowPlayingAt,
      lastError: conn.lastError,
      needsReauth: conn.lastError === "reauth_required",
    };
  },
});

export const listMyTracks = query({
  args: {
    kind: kindValidator,
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { kind, limit, devUserId }) => {
    const user = await resolveCallerUser(ctx, devUserId);
    const rows = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", user._id).eq("kind", kind),
      )
      .collect();
    const capped = Math.min(limit ?? DEFAULT_RESULTS, MAX_RESULTS);
    return sortForKind(kind, rows).slice(0, capped).map(toClientTrack);
  },
});

export const listUserTracksForViewer = query({
  args: {
    ownerUserId: v.id("users"),
    kind: kindValidator,
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { ownerUserId, kind, limit, devUserId }) => {
    const viewer = await resolveCallerUser(ctx, devUserId);
    if (!(await isViewerAllowed(ctx, viewer._id, ownerUserId))) {
      return null;
    }
    const rows = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", ownerUserId).eq("kind", kind),
      )
      .collect();
    const capped = Math.min(limit ?? DEFAULT_RESULTS, MAX_RESULTS);
    return sortForKind(kind, rows).slice(0, capped).map(toClientTrack);
  },
});

export const getNowPlayingForViewer = query({
  args: {
    ownerUserId: v.id("users"),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { ownerUserId, devUserId }) => {
    const viewer = await resolveCallerUser(ctx, devUserId);
    if (!(await isViewerAllowed(ctx, viewer._id, ownerUserId))) {
      return null;
    }
    const row = await ctx.db
      .query("spotifyNowPlaying")
      .withIndex("by_user", (q) => q.eq("userId", ownerUserId))
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      isPlaying: row.isPlaying,
      spotifyTrackId: row.spotifyTrackId,
      uri: row.uri,
      title: row.title,
      artists: row.artists,
      albumImageUrl: row.albumImageUrl,
      previewUrl: row.previewUrl,
      progressMs: row.progressMs,
      durationMs: row.durationMs,
      fetchedAt: row.fetchedAt,
    };
  },
});

export const getMyNowPlaying = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const user = await resolveCallerUser(ctx, devUserId);
    const row = await ctx.db
      .query("spotifyNowPlaying")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      isPlaying: row.isPlaying,
      spotifyTrackId: row.spotifyTrackId,
      uri: row.uri,
      title: row.title,
      artists: row.artists,
      albumImageUrl: row.albumImageUrl,
      previewUrl: row.previewUrl,
      progressMs: row.progressMs,
      durationMs: row.durationMs,
      fetchedAt: row.fetchedAt,
    };
  },
});
