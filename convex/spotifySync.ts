import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";
import { getUserAccessToken } from "./spotifyOAuth";

// Per-user Spotify sync actions.
//
// Public: syncLiked / syncRecent / syncTop / syncNowPlaying are callable
// directly so the UI can offer a manual "Sync now" button. They all require
// an authenticated caller and operate on the caller's own connection.
//
// Internal: `sweepNowPlaying` and `sweepScheduled` run from crons. Neither
// has an authenticated caller, so they iterate every connection row directly.
//
// Staleness thresholds (kept here so the crons and the manual buttons agree
// on when a sync is "worth running"):
//   liked  — 6h
//   top    — 24h
//   recent — always run (Spotify only keeps the last 50 plays)

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const FETCH_TIMEOUT_MS = 10_000;
const LIKED_PAGES_PER_SYNC = 4; // 4 * 50 = 200 newest liked tracks
const TOP_LIMIT = 50;

const LIKED_STALE_MS = 6 * 60 * 60 * 1000;
const TOP_STALE_MS = 24 * 60 * 60 * 1000;

// How long a single "viewer is watching" ping keeps the connection in the
// now-playing polling sweep.
const WATCH_WINDOW_MS = 90_000;

type TrackKind =
  | "liked"
  | "recent"
  | "top_short"
  | "top_medium"
  | "top_long";

type NormalizedTrack = {
  spotifyTrackId: string;
  uri: string;
  title: string;
  artists: string;
  albumImageUrl?: string;
  previewUrl?: string;
};

type SpotifyArtist = { name: string };
type SpotifyImage = { url: string };
type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  preview_url?: string | null;
  artists?: SpotifyArtist[];
  album?: { images?: SpotifyImage[] };
};

function firstImageUrl(images?: SpotifyImage[]): string | undefined {
  return images && images.length > 0 ? images[0].url : undefined;
}

function normalizeTrack(t: SpotifyTrack): NormalizedTrack {
  return {
    spotifyTrackId: t.id,
    uri: t.uri,
    title: t.name,
    artists: (t.artists ?? []).map((a) => a.name).join(", "),
    albumImageUrl: firstImageUrl(t.album?.images),
    previewUrl: t.preview_url ?? undefined,
  };
}

async function spotifyGet<T>(
  accessToken: string,
  path: string,
): Promise<{ status: number; body: T | null; retryAfter?: number }> {
  const url = path.startsWith("http") ? path : `${SPOTIFY_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 429) {
    const ra = res.headers.get("Retry-After");
    return {
      status: 429,
      body: null,
      retryAfter: ra ? Number(ra) : undefined,
    };
  }
  // 204 No Content — common on /me/player/currently-playing when nothing is
  // loaded. Treat as null body without parsing.
  if (res.status === 204) return { status: 204, body: null };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Spotify API call failed", {
      path,
      status: res.status,
      body: text,
    });
    return { status: res.status, body: null };
  }
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function resolveCallerUserId(
  ctx: ActionCtx,
  devUserId?: Id<"users">,
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId });
  const user: Doc<"users"> | null = await ctx.runQuery(
    internal.users.getUserByEmailInternal,
    { email: identity.email },
  );
  if (!user) throw new Error("User row not found for caller");
  return user._id;
}

// ─── Internal queries ────────────────────────────────────────────────────────

export const _listConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spotifyConnections").collect();
  },
});

export const _listWatchedConnections = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    return await ctx.db
      .query("spotifyConnections")
      .withIndex("by_watchUntil", (q) => q.gt("watchUntil", now))
      .collect();
  },
});

export const _getExistingTrackIdsForKind = internalQuery({
  args: {
    userId: v.id("users"),
    kind: v.union(
      v.literal("liked"),
      v.literal("recent"),
      v.literal("top_short"),
      v.literal("top_medium"),
      v.literal("top_long"),
    ),
  },
  handler: async (ctx, { userId, kind }) => {
    const rows = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", userId).eq("kind", kind),
      )
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      spotifyTrackId: r.spotifyTrackId,
      playedAt: r.playedAt,
    }));
  },
});

// ─── Internal mutations ─────────────────────────────────────────────────────

const kindValidator = v.union(
  v.literal("liked"),
  v.literal("recent"),
  v.literal("top_short"),
  v.literal("top_medium"),
  v.literal("top_long"),
);

const normalizedTrackValidator = v.object({
  spotifyTrackId: v.string(),
  uri: v.string(),
  title: v.string(),
  artists: v.string(),
  albumImageUrl: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
});

// Replace all rows of a given kind for a user. Used for top_short/medium/long
// where rank is volatile and the whole list is re-computed on each sync.
export const _replaceKindTracks = internalMutation({
  args: {
    userId: v.id("users"),
    kind: kindValidator,
    items: v.array(
      v.object({
        track: normalizedTrackValidator,
        rank: v.number(),
      }),
    ),
  },
  handler: async (ctx, { userId, kind, items }) => {
    const existing = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", userId).eq("kind", kind),
      )
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const { track, rank } of items) {
      await ctx.db.insert("spotifyUserTracks", {
        userId,
        kind,
        spotifyTrackId: track.spotifyTrackId,
        uri: track.uri,
        title: track.title,
        artists: track.artists,
        albumImageUrl: track.albumImageUrl,
        previewUrl: track.previewUrl,
        rank,
        syncedAt: now,
      });
    }
    return null;
  },
});

// Incremental upsert for "liked" kind. Existing rows (by spotifyTrackId) are
// patched (title/artwork could have been corrected upstream); new rows are
// inserted with the supplied `addedAt`.
export const _upsertLikedTracks = internalMutation({
  args: {
    userId: v.id("users"),
    items: v.array(
      v.object({
        track: normalizedTrackValidator,
        addedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { userId, items }) => {
    const now = Date.now();
    for (const { track, addedAt } of items) {
      const existing = await ctx.db
        .query("spotifyUserTracks")
        .withIndex("by_user_kind_and_track", (q) =>
          q
            .eq("userId", userId)
            .eq("kind", "liked")
            .eq("spotifyTrackId", track.spotifyTrackId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          title: track.title,
          artists: track.artists,
          uri: track.uri,
          albumImageUrl: track.albumImageUrl,
          previewUrl: track.previewUrl,
          addedAt,
          syncedAt: now,
        });
      } else {
        await ctx.db.insert("spotifyUserTracks", {
          userId,
          kind: "liked",
          spotifyTrackId: track.spotifyTrackId,
          uri: track.uri,
          title: track.title,
          artists: track.artists,
          albumImageUrl: track.albumImageUrl,
          previewUrl: track.previewUrl,
          addedAt,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

// Incremental insert for "recent" kind. Dedupe key is (trackId, playedAt)
// because a track can legitimately appear multiple times at different
// timestamps. Uses the per-user existing list once and filters in memory.
export const _insertRecentTracks = internalMutation({
  args: {
    userId: v.id("users"),
    items: v.array(
      v.object({
        track: normalizedTrackValidator,
        playedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { userId, items }) => {
    if (items.length === 0) return null;
    const existing = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", userId).eq("kind", "recent"),
      )
      .collect();
    const seen = new Set(
      existing.map((r) => `${r.spotifyTrackId}:${r.playedAt ?? 0}`),
    );
    const now = Date.now();
    for (const { track, playedAt } of items) {
      const key = `${track.spotifyTrackId}:${playedAt}`;
      if (seen.has(key)) continue;
      await ctx.db.insert("spotifyUserTracks", {
        userId,
        kind: "recent",
        spotifyTrackId: track.spotifyTrackId,
        uri: track.uri,
        title: track.title,
        artists: track.artists,
        albumImageUrl: track.albumImageUrl,
        previewUrl: track.previewUrl,
        playedAt,
        syncedAt: now,
      });
    }
    return null;
  },
});

export const _markSyncAt = internalMutation({
  args: {
    connectionId: v.id("spotifyConnections"),
    field: v.union(
      v.literal("lastLikedSyncAt"),
      v.literal("lastRecentSyncAt"),
      v.literal("lastTopSyncAt"),
      v.literal("lastNowPlayingAt"),
    ),
    at: v.number(),
  },
  handler: async (ctx, { connectionId, field, at }) => {
    await ctx.db.patch(connectionId, { [field]: at });
    return null;
  },
});

export const _upsertNowPlaying = internalMutation({
  args: {
    userId: v.id("users"),
    isPlaying: v.boolean(),
    spotifyTrackId: v.optional(v.string()),
    uri: v.optional(v.string()),
    title: v.optional(v.string()),
    artists: v.optional(v.string()),
    albumImageUrl: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    progressMs: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("spotifyNowPlaying")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("spotifyNowPlaying", args);
  },
});

// ─── Sync implementations (callable directly so manual + cron share code) ──

async function doSyncLiked(ctx: ActionCtx, userId: Id<"users">): Promise<void> {
  const { accessToken, connection } = await getUserAccessToken(ctx, userId);
  const items: Array<{ track: NormalizedTrack; addedAt: number }> = [];
  let offset = 0;
  for (let page = 0; page < LIKED_PAGES_PER_SYNC; page++) {
    const { status, body } = await spotifyGet<{
      items: Array<{ added_at: string; track: SpotifyTrack | null }>;
      next: string | null;
    }>(accessToken, `/me/tracks?limit=50&offset=${offset}`);
    if (status === 429 || !body) break;
    for (const it of body.items ?? []) {
      if (!it.track) continue;
      items.push({
        track: normalizeTrack(it.track),
        addedAt: Date.parse(it.added_at),
      });
    }
    if (!body.next) break;
    offset += 50;
  }
  if (items.length > 0) {
    await (ctx.runMutation(internal.spotifySync._upsertLikedTracks, {
      userId,
      items,
    }) as Promise<null>);
  }
  await (ctx.runMutation(internal.spotifySync._markSyncAt, {
    connectionId: connection._id,
    field: "lastLikedSyncAt",
    at: Date.now(),
  }) as Promise<null>);
}

async function doSyncRecent(ctx: ActionCtx, userId: Id<"users">): Promise<void> {
  const { accessToken, connection } = await getUserAccessToken(ctx, userId);
  const after = connection.lastRecentSyncAt;
  const path = after
    ? `/me/player/recently-played?limit=50&after=${after}`
    : `/me/player/recently-played?limit=50`;
  const { status, body } = await spotifyGet<{
    items: Array<{ played_at: string; track: SpotifyTrack | null }>;
  }>(accessToken, path);
  if (status === 429 || !body) return;
  const items: Array<{ track: NormalizedTrack; playedAt: number }> = [];
  let maxPlayedAt = after ?? 0;
  for (const it of body.items ?? []) {
    if (!it.track) continue;
    const playedAt = Date.parse(it.played_at);
    items.push({ track: normalizeTrack(it.track), playedAt });
    if (playedAt > maxPlayedAt) maxPlayedAt = playedAt;
  }
  if (items.length > 0) {
    await (ctx.runMutation(internal.spotifySync._insertRecentTracks, {
      userId,
      items,
    }) as Promise<null>);
  }
  // Advance the cursor even when no new items, so we don't re-request the
  // same window. Fall back to "now" when we truly have nothing to learn from.
  await (ctx.runMutation(internal.spotifySync._markSyncAt, {
    connectionId: connection._id,
    field: "lastRecentSyncAt",
    at: maxPlayedAt || Date.now(),
  }) as Promise<null>);
}

async function doSyncTopForRange(
  ctx: ActionCtx,
  userId: Id<"users">,
  range: "short_term" | "medium_term" | "long_term",
  kind: "top_short" | "top_medium" | "top_long",
): Promise<void> {
  const { accessToken } = await getUserAccessToken(ctx, userId);
  const { status, body } = await spotifyGet<{ items: SpotifyTrack[] }>(
    accessToken,
    `/me/top/tracks?limit=${TOP_LIMIT}&time_range=${range}`,
  );
  if (status === 429 || !body) return;
  const items = (body.items ?? []).map((t, i) => ({
    track: normalizeTrack(t),
    rank: i + 1,
  }));
  await (ctx.runMutation(internal.spotifySync._replaceKindTracks, {
    userId,
    kind,
    items,
  }) as Promise<null>);
}

async function doSyncTop(ctx: ActionCtx, userId: Id<"users">): Promise<void> {
  const { connection } = await getUserAccessToken(ctx, userId);
  await doSyncTopForRange(ctx, userId, "short_term", "top_short");
  await doSyncTopForRange(ctx, userId, "medium_term", "top_medium");
  await doSyncTopForRange(ctx, userId, "long_term", "top_long");
  await (ctx.runMutation(internal.spotifySync._markSyncAt, {
    connectionId: connection._id,
    field: "lastTopSyncAt",
    at: Date.now(),
  }) as Promise<null>);
}

async function doSyncNowPlaying(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<void> {
  const { accessToken, connection } = await getUserAccessToken(ctx, userId);
  const { status, body } = await spotifyGet<{
    is_playing: boolean;
    progress_ms?: number;
    item?: (SpotifyTrack & { duration_ms?: number }) | null;
  }>(accessToken, "/me/player/currently-playing");
  const now = Date.now();
  if (status === 204 || !body || !body.item) {
    await (ctx.runMutation(internal.spotifySync._upsertNowPlaying, {
      userId,
      isPlaying: false,
      fetchedAt: now,
    }) as Promise<Id<"spotifyNowPlaying">>);
  } else {
    const track = body.item;
    const normalized = normalizeTrack(track);
    await (ctx.runMutation(internal.spotifySync._upsertNowPlaying, {
      userId,
      isPlaying: Boolean(body.is_playing),
      spotifyTrackId: normalized.spotifyTrackId,
      uri: normalized.uri,
      title: normalized.title,
      artists: normalized.artists,
      albumImageUrl: normalized.albumImageUrl,
      previewUrl: normalized.previewUrl,
      progressMs: body.progress_ms,
      durationMs: track.duration_ms,
      fetchedAt: now,
    }) as Promise<Id<"spotifyNowPlaying">>);
  }
  await (ctx.runMutation(internal.spotifySync._markSyncAt, {
    connectionId: connection._id,
    field: "lastNowPlayingAt",
    at: now,
  }) as Promise<null>);
}

// ─── Public actions (user-triggered) ────────────────────────────────────────

export const syncLiked = action({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const userId = await resolveCallerUserId(ctx, devUserId);
    await doSyncLiked(ctx, userId);
    return { ok: true as const };
  },
});

export const syncRecent = action({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const userId = await resolveCallerUserId(ctx, devUserId);
    await doSyncRecent(ctx, userId);
    return { ok: true as const };
  },
});

export const syncTop = action({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const userId = await resolveCallerUserId(ctx, devUserId);
    await doSyncTop(ctx, userId);
    return { ok: true as const };
  },
});

export const syncNowPlaying = action({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const userId = await resolveCallerUserId(ctx, devUserId);
    await doSyncNowPlaying(ctx, userId);
    return { ok: true as const };
  },
});

export const syncAll = action({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const userId = await resolveCallerUserId(ctx, devUserId);
    await doSyncLiked(ctx, userId);
    await doSyncRecent(ctx, userId);
    await doSyncTop(ctx, userId);
    await doSyncNowPlaying(ctx, userId);
    return { ok: true as const };
  },
});

// ─── Demand-gate mutation for now-playing polling ───────────────────────────

// Called by clients when a viewer opens a connected user's profile. Extends
// the owner's `watchUntil` so the cron sweep picks them up. Viewer identity
// isn't strictly required, but we gate on "viewer is signed in AND friend or
// self" to avoid random traffic waking up arbitrary users' connections.
export const requestNowPlayingPoll = mutation({
  args: {
    ownerUserId: v.id("users"),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { ownerUserId, devUserId }) => {
    const identity = await resolveIdentity(ctx, { devUserId });
    const viewer = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!viewer) throw new Error("Viewer row not found");
    if (viewer._id !== ownerUserId) {
      const edge = await ctx.db
        .query("friends")
        .withIndex("by_user_and_friend", (q) =>
          q.eq("userId", ownerUserId).eq("friendId", viewer._id),
        )
        .unique();
      if (!edge || edge.status !== "accepted") {
        // Not friends — silently no-op. We don't throw because the profile
        // page may still render other public bits; we just don't poll.
        return { ok: false as const };
      }
    }
    const conn = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_user", (q) => q.eq("userId", ownerUserId))
      .unique();
    if (!conn) return { ok: false as const };
    await ctx.db.patch(conn._id, { watchUntil: Date.now() + WATCH_WINDOW_MS });
    return { ok: true as const };
  },
});

// ─── Internal actions called by crons / the OAuth callback ──────────────────

// Runs a full sync (liked + recent + top + now-playing) once, swallowing
// per-phase errors so one failure doesn't prevent the others. Used by the
// OAuth callback so users see data immediately after connecting.
export const runFullSyncForUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const phases: Array<[string, () => Promise<void>]> = [
      ["liked", () => doSyncLiked(ctx, userId)],
      ["recent", () => doSyncRecent(ctx, userId)],
      ["top", () => doSyncTop(ctx, userId)],
      ["nowPlaying", () => doSyncNowPlaying(ctx, userId)],
    ];
    for (const [name, fn] of phases) {
      try {
        await fn();
      } catch (e) {
        console.error(`runFullSyncForUser ${name} failed`, {
          userId,
          error: (e as Error).message,
        });
      }
    }
    return null;
  },
});

// Cron: every 30 seconds. Polls `/me/player/currently-playing` only for
// connections whose `watchUntil > now`, so idle users don't burn quota.
export const sweepNowPlaying = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const watched: Doc<"spotifyConnections">[] = await ctx.runQuery(
      internal.spotifySync._listWatchedConnections,
      { now },
    );
    for (const conn of watched) {
      try {
        await doSyncNowPlaying(ctx, conn.userId);
      } catch (e) {
        console.error("sweepNowPlaying failed for user", {
          userId: conn.userId,
          error: (e as Error).message,
        });
      }
    }
    return null;
  },
});

// Cron: every 15 minutes. Runs recent for every connection; liked/top if
// stale beyond their thresholds.
export const sweepScheduled = internalAction({
  args: {},
  handler: async (ctx) => {
    const connections: Doc<"spotifyConnections">[] = await ctx.runQuery(
      internal.spotifySync._listConnections,
      {},
    );
    const now = Date.now();
    for (const conn of connections) {
      if (conn.lastError === "reauth_required") continue;
      try {
        await doSyncRecent(ctx, conn.userId);
      } catch (e) {
        console.error("sweepScheduled recent failed", {
          userId: conn.userId,
          error: (e as Error).message,
        });
      }
      const lastLiked = conn.lastLikedSyncAt ?? 0;
      if (now - lastLiked > LIKED_STALE_MS) {
        try {
          await doSyncLiked(ctx, conn.userId);
        } catch (e) {
          console.error("sweepScheduled liked failed", {
            userId: conn.userId,
            error: (e as Error).message,
          });
        }
      }
      const lastTop = conn.lastTopSyncAt ?? 0;
      if (now - lastTop > TOP_STALE_MS) {
        try {
          await doSyncTop(ctx, conn.userId);
        } catch (e) {
          console.error("sweepScheduled top failed", {
            userId: conn.userId,
            error: (e as Error).message,
          });
        }
      }
    }
    return null;
  },
});
