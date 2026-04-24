# Spotify integration — build summary

User-scoped Spotify integration layered on top of the existing catalog-search
integration. Lets users connect their Spotify account; syncs liked songs,
top tracks (three time ranges), recently played, and live now-playing into
Convex; exposes all of it to the owner and to accepted friends; plays
tracks in-app via the public Spotify embed iframe.

Implemented on branch `worktree-spotify-integration` inside the worktree at
`A:\Work\homie\homie-web\.claude\worktrees\spotify-integration`.

## File-by-file

### Convex (backend)

| File | Purpose |
|---|---|
| `convex/schema.ts` | +3 tables — `spotifyConnections` (per-user OAuth + sync bookkeeping + demand-gate), `spotifyUserTracks` (liked / recent / top_short / top_medium / top_long discriminated by `kind`), `spotifyNowPlaying` (one row per user, live) |
| `convex/spotifyOAuth.ts` | `getAuthUrl` (action — builds Spotify authorize URL, takes a CSRF `state` from the caller), `persistConnection` (action — exchanges `code` for tokens, fetches `/me`, upserts connection, schedules a full sync), `disconnect` (mutation — wipes connection + all synced rows). Shared `getUserAccessToken` helper handles refresh-on-expiry and refresh-token rotation; `invalid_grant` → `lastError: "reauth_required"` so the UI can show a Reconnect CTA. |
| `convex/spotifySync.ts` | Public actions `syncLiked` / `syncRecent` / `syncTop` / `syncNowPlaying` / `syncAll`; demand-gate mutation `requestNowPlayingPoll` (called by clients viewing a friend's profile); internal `sweepNowPlaying` (runs from 30s cron — only polls connections with `watchUntil > now`); internal `sweepScheduled` (runs from 15m cron — recent always, liked if >6h stale, top if >24h stale); internal `runFullSyncForUser` (fired once after `persistConnection` completes so users see data immediately). |
| `convex/spotifyFeed.ts` | Viewer-facing queries: `getMyConnection`, `listMyTracks`, `listUserTracksForViewer`, `getMyNowPlaying`, `getNowPlayingForViewer`. All friend/self-gated; non-friends get `null`. Never exposes tokens. |
| `convex/crons.ts` | Two new `crons.interval` entries — 30s now-playing sweep, 15m scheduled sync. |

### Next.js (frontend)

| File | Purpose |
|---|---|
| `app/api/spotify/connect/route.ts` | GET handler. Generates 24-byte random `state`, sets it as an HttpOnly `spotify_oauth_state` cookie (10 min TTL), asks Convex for the authorize URL, 302s to Spotify. In dev mode reads `devUserId` from query param and stores it in a second cookie so the callback can pair it back to the right user. |
| `app/api/spotify/callback/route.ts` | GET handler. Verifies state cookie matches query `state` (CSRF guard), calls `api.spotifyOAuth.persistConnection` with the `code`, redirects to `/dashboard/integrations?connected=1` or `?error=…`. Clears one-shot cookies regardless of outcome. |
| `app/dashboard/integrations/page.tsx` | The integrations page. Surfaces `?connected=1` / `?error=…` as a toast once per mount. Renders the integration card; when connected, renders the "Now playing" pill and the feed. |

### React components

| Component | Purpose |
|---|---|
| `components/spotify/SpotifyIntegrationCard.tsx` | Connect / Sync now / Disconnect card. Three states: not connected, connected, reauth-required (banner + Reconnect CTA, Sync button disabled). |
| `components/spotify/NowPlayingPill.tsx` | Live pill. Two responsibilities beyond the obvious: (1) demand-pings `requestNowPlayingPoll` every 60s while mounted so the 30s cron sweep picks up this user; (2) extrapolates `progressMs` client-side every 1s between server updates so the progress bar feels smooth. |
| `components/spotify/SpotifyFeed.tsx` | Tabs for Top · 4w / 6mo / all-time / Liked / Recent. Clicking a row expands an inline Spotify embed under that row (one open at a time). |
| `components/spotify/SpotifyEmbed.tsx` | Thin wrapper around `open.spotify.com/embed/track/{id}`. Plays 30s preview for free Spotify users and the full track for Premium — no SDK, no auth, no Premium check in our code. |
| `components/app-sidebar.tsx` *(modified)* | Adds an **Integrations** item under the user-menu dropdown with a `PlugZap` icon. |

### Docs

| File | Purpose |
|---|---|
| `docs/spotify-integration-setup.md` | Spotify dashboard setup, Convex env var commands, scope list, sync cadence, dev testing steps, privacy model. |
| `docs/spotify-integration-summary.md` | This file. |
| `docs/spotify-integration-testing.md` | Testing strategy — what to verify, how to simulate edge cases. |

## Architectural decisions

- **Separate tables, not merged into `users.media[]`.** Spotify data is
  volatile and high-churn; stuffing it into the profile array would force
  every sync to rewrite the whole user row. It also keeps visibility simple —
  the media array has its own per-item visibility tag; Spotify feeds use a
  blanket "self or friend" gate.
- **Auth flow is Authorization Code, not PKCE.** Convex actions are our
  server, the client secret is safely stored in Convex env, and refresh
  tokens are long-lived.
- **OAuth callback lives on the Next.js side, not Convex HTTP.** Cookies
  are the CSRF guard for `state`, and Next.js route handlers have native
  cookie support that Convex HTTP endpoints don't.
- **Demand-gated now-playing polling.** A naive "poll every connected user
  every 30s" design would exhaust Spotify's rolling 30s rate-limit window
  the moment the user base grew. Instead, clients call `requestNowPlayingPoll`
  while a friend's profile is open, bumping `watchUntil`; the cron sweep
  only polls connections whose `watchUntil > now`.
- **Full-track playback uses Spotify's public embed iframe.** Zero extra
  scopes, zero Premium-required code-paths, works for everyone at the
  30s-preview level and upgrades itself to full for Premium listeners.
  The Web Playback SDK was deliberately deferred.

## Known not-done (v2 candidates)

- Fine-grained per-kind visibility (close-only, mutual-friends, public).
  Today it's "self or any accepted friend" — baked into queries, not stored.
- Full-track playback via Spotify Web Playback SDK for Premium users.
- Writing synced items into `users.media[]` for the chat agent's tool calls
  to see.
- Web Playback SDK "listen-along" (server-coordinated cross-user sync).
- Incremental schema migration if we change the `kind` enum or dedupe key.

## Post-build setup checklist

Before this branch is testable:

1. **Spotify Developer Dashboard** — add both dev and prod redirect URIs
   byte-for-byte; allowlist your Spotify email under the app's Users and
   Access page (apps default to 25-user Development Mode).
2. **Convex env** —
   ```
   npx convex env set SPOTIFY_CLIENT_ID       <id>
   npx convex env set SPOTIFY_CLIENT_SECRET   <secret>
   npx convex env set SPOTIFY_REDIRECT_URI    http://localhost:3000/api/spotify/callback
   ```
   The client id / secret may already be set from the catalog-search
   integration; only the redirect URI is new.
3. **`npx convex dev`** against the worktree so the three new tables and
   two new crons land on the dev deployment.
