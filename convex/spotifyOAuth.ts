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

// Per-user Spotify OAuth — Authorization Code flow.
//
// Env vars read here (all on the Convex deployment, not Next.js):
//   SPOTIFY_CLIENT_ID       — shared with the catalog-search client creds flow
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REDIRECT_URI    — must EXACTLY match the URI registered in the
//                             Spotify developer dashboard and point at
//                             `{app origin}/api/spotify/callback`.
//
// Public entry points:
//   getAuthUrl          — called from the Next.js /api/spotify/connect route
//                          which has set a CSRF `state` cookie.
//   persistConnection   — called from the Next.js /api/spotify/callback route
//                          once the state cookie has been verified.
//   disconnect          — called from the Integrations page; wipes the
//                          connection + all synced rows for the caller.
//
// The helper `getUserAccessToken` is the single source for a fresh access
// token across sync actions — it refreshes on expiry and rotates the refresh
// token if Spotify issues a new one.

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "user-read-recently-played",
  "user-top-read",
  "user-read-currently-playing",
  "user-read-playback-state",
] as const;

const SPOTIFY_ACCOUNTS_AUTHORIZE = "https://accounts.spotify.com/authorize";
const SPOTIFY_ACCOUNTS_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const PROFILE_FETCH_TIMEOUT_MS = 8_000;

// Refresh slightly before real expiry so an in-flight sync never 401s on a
// token that lapses mid-request.
const EXPIRY_SKEW_MS = 60_000;

function readRequiredEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Spotify OAuth env vars missing. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI via `npx convex env set`.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// ─── Internal CRUD on spotifyConnections ────────────────────────────────────

export const _readConnectionByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("spotifyConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const _upsertConnection = internalMutation({
  args: {
    userId: v.id("users"),
    spotifyUserId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        spotifyUserId: args.spotifyUserId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scopes: args.scopes,
        lastError: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("spotifyConnections", {
      userId: args.userId,
      spotifyUserId: args.spotifyUserId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
      connectedAt: Date.now(),
    });
  },
});

export const _patchConnectionTokens = internalMutation({
  args: {
    connectionId: v.id("spotifyConnections"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { connectionId, accessToken, refreshToken, expiresAt }) => {
    await ctx.db.patch(connectionId, {
      accessToken,
      refreshToken,
      expiresAt,
      lastError: undefined,
    });
    return null;
  },
});

export const _markConnectionError = internalMutation({
  args: {
    connectionId: v.id("spotifyConnections"),
    error: v.string(),
  },
  handler: async (ctx, { connectionId, error }) => {
    await ctx.db.patch(connectionId, { lastError: error });
    return null;
  },
});

export const _deleteConnectionAndData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const conn = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (conn) await ctx.db.delete(conn._id);

    const tracks = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) => q.eq("userId", userId))
      .collect();
    for (const row of tracks) await ctx.db.delete(row._id);

    const np = await ctx.db
      .query("spotifyNowPlaying")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (np) await ctx.db.delete(np._id);
    return null;
  },
});

// ─── Token refresh helper — shared with sync actions ────────────────────────

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
};

async function exchangeRefreshToken(
  refreshToken: string,
): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret } = readRequiredEnv();
  const basic = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(SPOTIFY_ACCOUNTS_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Spotify refresh failed: ${res.status}`);
    // Surface invalid_grant up so the caller can mark the connection for
    // reauth — any other failure is treated as transient.
    (err as Error & { spotifyStatus?: number; spotifyBody?: string }).spotifyStatus =
      res.status;
    (err as Error & { spotifyStatus?: number; spotifyBody?: string }).spotifyBody =
      text;
    throw err;
  }
  return (await res.json()) as SpotifyTokenResponse;
}

// Returns a fresh access token for `userId`, refreshing it in-place if the
// cached one is within `EXPIRY_SKEW_MS` of expiry. Throws with a readable
// message on reauth-required; callers should catch and skip the sync rather
// than let the error bubble to the cron.
export async function getUserAccessToken(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<{ accessToken: string; connection: Doc<"spotifyConnections"> }> {
  const connection: Doc<"spotifyConnections"> | null = await ctx.runQuery(
    internal.spotifyOAuth._readConnectionByUser,
    { userId },
  );
  if (!connection) {
    throw new Error("No Spotify connection for user");
  }
  if (connection.expiresAt - Date.now() > EXPIRY_SKEW_MS) {
    return { accessToken: connection.accessToken, connection };
  }

  try {
    const refreshed = await exchangeRefreshToken(connection.refreshToken);
    const newRefreshToken = refreshed.refresh_token ?? connection.refreshToken;
    const expiresAt = Date.now() + refreshed.expires_in * 1000;
    await (ctx.runMutation(internal.spotifyOAuth._patchConnectionTokens, {
      connectionId: connection._id,
      accessToken: refreshed.access_token,
      refreshToken: newRefreshToken,
      expiresAt,
    }) as Promise<null>);
    return {
      accessToken: refreshed.access_token,
      connection: {
        ...connection,
        accessToken: refreshed.access_token,
        refreshToken: newRefreshToken,
        expiresAt,
      },
    };
  } catch (e) {
    const status = (e as { spotifyStatus?: number }).spotifyStatus;
    const body = (e as { spotifyBody?: string }).spotifyBody ?? "";
    // 400 with `invalid_grant` means the refresh token is no longer valid —
    // user revoked access on Spotify's side, or it was rotated by a concurrent
    // request and we raced. Either way, the UI path is Reconnect.
    if (status === 400 && body.includes("invalid_grant")) {
      await (ctx.runMutation(internal.spotifyOAuth._markConnectionError, {
        connectionId: connection._id,
        error: "reauth_required",
      }) as Promise<null>);
    }
    throw e;
  }
}

// ─── Public: getAuthUrl ─────────────────────────────────────────────────────

// Builds the Spotify authorize URL. The Next.js /api/spotify/connect route
// generates the `state` value, stores it in an HttpOnly cookie, then asks
// this action for the URL. We don't generate state here because Convex can't
// set cookies — the CSRF check has to live on the same surface that holds
// the cookie.
export const getAuthUrl = action({
  args: {
    state: v.string(),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { state, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });
    if (!state || state.length < 16) {
      throw new Error("state must be at least 16 chars");
    }
    const { clientId, redirectUri } = readRequiredEnv();
    const url = new URL(SPOTIFY_ACCOUNTS_AUTHORIZE);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
    url.searchParams.set("state", state);
    // Force the consent screen so users see the current scope list even if
    // they've authorized a narrower set before.
    url.searchParams.set("show_dialog", "true");
    return url.toString();
  },
});

// ─── Public: persistConnection (callback → tokens + upsert) ─────────────────

export const persistConnection = action({
  args: {
    code: v.string(),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { code, devUserId }) => {
    const identity = await resolveIdentity(ctx, { devUserId });
    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getUserByEmailInternal,
      { email: identity.email },
    );
    if (!user) throw new Error("User row not found for caller");

    const { clientId, clientSecret, redirectUri } = readRequiredEnv();
    const basic = btoa(`${clientId}:${clientSecret}`);
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(SPOTIFY_ACCOUNTS_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      console.error("Spotify token exchange failed", {
        status: tokenRes.status,
        body: text,
      });
      throw new Error("Spotify token exchange failed");
    }
    const token = (await tokenRes.json()) as SpotifyTokenResponse;
    if (!token.refresh_token) {
      // Shouldn't happen on Authorization Code flow, but guard anyway.
      throw new Error("Spotify token response missing refresh_token");
    }
    const expiresAt = Date.now() + token.expires_in * 1000;
    const scopes = (token.scope ?? "").split(" ").filter(Boolean);

    const meRes = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
    });
    if (!meRes.ok) {
      const text = await meRes.text().catch(() => "");
      console.error("Spotify /me fetch failed", {
        status: meRes.status,
        body: text,
      });
      throw new Error("Spotify profile fetch failed");
    }
    const me = (await meRes.json()) as { id: string };

    await (ctx.runMutation(internal.spotifyOAuth._upsertConnection, {
      userId: user._id,
      spotifyUserId: me.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      scopes,
    }) as Promise<Id<"spotifyConnections">>);

    // Kick off a full sync in the background so the user sees fresh data on
    // the integrations page without waiting for the 15-min cron.
    await ctx.scheduler.runAfter(0, internal.spotifySync.runFullSyncForUser, {
      userId: user._id,
    });

    return { ok: true as const };
  },
});

// ─── Public: disconnect ─────────────────────────────────────────────────────

export const disconnect = mutation({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, { devUserId }) => {
    const identity = await resolveIdentity(ctx, { devUserId });
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) throw new Error("User row not found for caller");

    const conn = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (conn) await ctx.db.delete(conn._id);

    const tracks = await ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of tracks) await ctx.db.delete(row._id);

    const np = await ctx.db
      .query("spotifyNowPlaying")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (np) await ctx.db.delete(np._id);
    return { ok: true as const };
  },
});

// Bridge for internal actions that need a one-shot disconnect without the
// user-identity gate (e.g. scheduled cleanups). Not currently used but kept
// here so sync actions never reach directly for `_deleteConnectionAndData`.
export const _forceDisconnect = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await (ctx.runMutation(internal.spotifyOAuth._deleteConnectionAndData, {
      userId,
    }) as Promise<null>);
    return null;
  },
});
