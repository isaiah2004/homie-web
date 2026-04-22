import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Refresh a little before the real expiry so an in-flight search never 401s
// on a token that's about to lapse mid-request.
const EXPIRY_SKEW_MS = 60_000;
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 100;

const SPOTIFY_KINDS = ["track", "album", "artist", "show"] as const;
type SpotifyKind = (typeof SPOTIFY_KINDS)[number];

const kindValidator = v.union(
  v.literal("track"),
  v.literal("album"),
  v.literal("artist"),
  v.literal("show"),
);

export type NormalizedSpotifyResult = {
  source: "spotify";
  kind: SpotifyKind;
  id: string;
  uri: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
};

export const _getCachedToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spotifyAuth").first();
  },
});

export const _writeToken = internalMutation({
  args: { accessToken: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    // Two concurrent refreshes can both reach this mutation; the second
    // would otherwise insert a duplicate row. Collapse any extras so
    // `first()` on read stays deterministic.
    const rows = await ctx.db.query("spotifyAuth").collect();
    if (rows.length === 0) {
      await ctx.db.insert("spotifyAuth", args);
      return;
    }
    const [keep, ...extras] = rows;
    await ctx.db.patch(keep._id, args);
    for (const extra of extras) {
      await ctx.db.delete(extra._id);
    }
  },
});

async function fetchClientCredentialsToken(): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Spotify credentials missing: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET via `npx convex env set`.",
    );
  }
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(SPOTIFY_ACCOUNTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    // Spotify echoes the client_id on some auth failures, so log the body
    // server-side only and surface a generic error to callers.
    const text = await res.text().catch(() => "");
    console.error("Spotify token request failed", { status: res.status, body: text });
    throw new Error("Spotify authentication failed");
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

async function getAccessToken(ctx: ActionCtx): Promise<string> {
  const cached: Doc<"spotifyAuth"> | null = await ctx.runQuery(
    internal.spotify._getCachedToken,
    {},
  );
  if (cached && cached.expiresAt - Date.now() > EXPIRY_SKEW_MS) {
    return cached.accessToken;
  }
  const fresh = await fetchClientCredentialsToken();
  // Explicit annotation per Convex guidelines for same-file runMutation calls.
  await (ctx.runMutation(internal.spotify._writeToken, fresh) as Promise<null>);
  return fresh.accessToken;
}

function firstImageUrl(
  images: Array<{ url: string }> | null | undefined,
): string | undefined {
  return images && images.length > 0 ? images[0].url : undefined;
}

type SpotifyArtist = { name: string };
type SpotifyImage = { url: string };
type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists?: SpotifyArtist[];
  album?: { images?: SpotifyImage[] };
};
type SpotifyAlbum = {
  id: string;
  uri: string;
  name: string;
  artists?: SpotifyArtist[];
  images?: SpotifyImage[];
  release_date?: string;
};
type SpotifyArtistItem = {
  id: string;
  uri: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
};
type SpotifyShow = {
  id: string;
  uri: string;
  name: string;
  publisher?: string;
  images?: SpotifyImage[];
};
type SpotifySearchResponse = {
  tracks?: { items: Array<SpotifyTrack | null> };
  albums?: { items: Array<SpotifyAlbum | null> };
  artists?: { items: Array<SpotifyArtistItem | null> };
  shows?: { items: Array<SpotifyShow | null> };
};

function normalize(data: SpotifySearchResponse): NormalizedSpotifyResult[] {
  const out: NormalizedSpotifyResult[] = [];

  for (const t of data.tracks?.items ?? []) {
    if (!t) continue;
    const artistNames = (t.artists ?? []).map((a) => a.name).join(", ");
    out.push({
      source: "spotify",
      kind: "track",
      id: t.id,
      uri: t.uri,
      title: t.name,
      subtitle: artistNames || undefined,
      imageUrl: firstImageUrl(t.album?.images),
    });
  }
  for (const a of data.albums?.items ?? []) {
    if (!a) continue;
    const artistNames = (a.artists ?? []).map((ar) => ar.name).join(", ");
    const year =
      typeof a.release_date === "string" ? a.release_date.slice(0, 4) : "";
    const subtitle = [artistNames, year].filter(Boolean).join(" • ");
    out.push({
      source: "spotify",
      kind: "album",
      id: a.id,
      uri: a.uri,
      title: a.name,
      subtitle: subtitle || undefined,
      imageUrl: firstImageUrl(a.images),
    });
  }
  for (const ar of data.artists?.items ?? []) {
    if (!ar) continue;
    const genres = (ar.genres ?? []).slice(0, 2).join(", ");
    out.push({
      source: "spotify",
      kind: "artist",
      id: ar.id,
      uri: ar.uri,
      title: ar.name,
      subtitle: genres || undefined,
      imageUrl: firstImageUrl(ar.images),
    });
  }
  for (const s of data.shows?.items ?? []) {
    if (!s) continue;
    out.push({
      source: "spotify",
      kind: "show",
      id: s.id,
      uri: s.uri,
      title: s.name,
      subtitle: s.publisher || undefined,
      imageUrl: firstImageUrl(s.images),
    });
  }
  return out;
}

export const searchSpotify = action({
  args: {
    query: v.string(),
    kinds: v.optional(v.array(kindValidator)),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { query, kinds, limit, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });

    const q = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [] as NormalizedSpotifyResult[];

    const kindsToUse: readonly SpotifyKind[] =
      kinds && kinds.length > 0 ? kinds : SPOTIFY_KINDS;
    const rawLimit = Number.isFinite(limit) ? (limit as number) : 10;
    const perKind = Math.min(Math.max(Math.floor(rawLimit), 1), 50);
    const token = await getAccessToken(ctx);

    const url = new URL(`${SPOTIFY_API_BASE}/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("type", kindsToUse.join(","));
    url.searchParams.set("limit", String(perKind));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Spotify search failed", { status: res.status, body: text });
      if (res.status === 429) {
        throw new Error("Spotify rate limit hit, please retry shortly");
      }
      throw new Error("Spotify search failed");
    }
    const data = (await res.json()) as SpotifySearchResponse;
    return normalize(data);
  },
});
