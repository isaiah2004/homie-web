# Spotify integration setup

User-scoped Spotify integration that syncs liked songs, top tracks, recently
played, and live now-playing into per-user Convex tables. This is separate
from the existing catalog-search integration (which uses the Client
Credentials flow for picker UIs) — user data requires Authorization Code
with a refresh token.

## One-time Spotify dashboard setup

1. Go to https://developer.spotify.com/dashboard and either reuse the existing
   Homie app or create a new one.
2. In the app's Settings, add each of these **exactly** under
   "Redirect URIs" (byte-for-byte — scheme, host, port, path, no trailing slash):
   - `http://localhost:3000/api/spotify/callback` (dev)
   - `https://<your-prod-host>/api/spotify/callback` (prod)
3. Note the Client ID and Client Secret.
4. ⚠️ **Allowlist your test users.** On the app's **Users and Access** page,
   add the Spotify email of every account you want to test with. New
   Spotify apps start in Development Mode capped at **25 users**, and
   non-allowlisted users can't complete the OAuth consent — they get
   "User not registered in the developer dashboard." When you're ready
   to lift the 25-user cap, apply for **Extended Quota Mode** via the
   same dashboard; the review is short but not instant.
5. No dashboard change is needed for scopes — they're requested per-auth
   from the app and the list lives in `SPOTIFY_SCOPES` inside
   `convex/spotifyOAuth.ts`.

## Can the same Spotify account link to multiple Homie users?

Short answer: yes, and we don't prevent it today.

Longer: the app-level `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are
shared across all Homie users — that's the whole point of OAuth. Each
Homie user does their own authorize round-trip and ends up with their
own per-user access+refresh tokens in their own `spotifyConnections` row.

The schema has a `by_user` index (one row per Homie user) but **no
uniqueness on `spotifyUserId`** — so the same Spotify account can be
linked to two different Homie accounts (e.g. a personal + business
Homie). Each gets independent tokens and the cron sweep will poll both,
which burns 2× quota for no user-visible benefit. If you want to enforce
"one Spotify account per install," add a pre-insert guard to
`_upsertConnection` that rejects when the `spotifyUserId` already exists
for a different `userId`.

## Convex env vars

The Convex backend is the only side that needs the client secret — Next.js
never sees it.

```sh
npx convex env set SPOTIFY_CLIENT_ID       <client id>
npx convex env set SPOTIFY_CLIENT_SECRET   <client secret>
npx convex env set SPOTIFY_REDIRECT_URI    http://localhost:3000/api/spotify/callback
```

`SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are shared with the
pre-existing client-credentials flow in `convex/spotify.ts`, so they may
already be set — only `SPOTIFY_REDIRECT_URI` is new.

Don't forget to set the prod URI on the prod Convex deployment too.

## Next.js env vars

Nothing new. The callback route relies on:

- `NEXT_PUBLIC_CONVEX_URL` (existing) — the Convex deployment URL the route
  calls `persistConnection` on.
- `NEXT_PUBLIC_DEV_MODE` (existing) — when `"true"`, the route trusts a
  `devUserId` query param + cookie instead of calling Clerk.

## Scopes requested

Requested together so the consent screen appears once:

- `user-read-email`
- `user-read-private`
- `user-library-read`          (liked songs)
- `user-read-recently-played`  (recents)
- `user-top-read`              (top tracks, three time ranges)
- `user-read-currently-playing`
- `user-read-playback-state`   (needed to distinguish playing/paused reliably)

The SDK-based Web Playback Kit (full-track playback in-browser) is **not**
requested because playback uses the public embed iframe, which needs no
OAuth at all. If we add full-track playback later, tack `streaming` onto
`SPOTIFY_SCOPES` in `convex/spotifyOAuth.ts`.

## Sync cadence

- `sweepNowPlaying` — every 30s. Demand-gated by `spotifyConnections.watchUntil`
  which clients bump via `requestNowPlayingPoll` while a friend's profile
  is open. Idle users are not polled.
- `sweepScheduled` — every 15 min. Always runs `syncRecent`; runs `syncLiked`
  if >6h stale; runs `syncTop` if >24h stale.
- Users can always press "Sync now" on the integrations page to force a
  full pass. The `syncAll` action does the four phases sequentially.

## Dev testing

1. Start the Convex dev server: `npx convex dev`.
2. Start Next.js in dev mode: `NEXT_PUBLIC_DEV_MODE=true pnpm dev`.
3. Open the floating DEV switcher and pick a seeded user.
4. Visit `/dashboard/integrations`, click Connect. You'll be redirected to
   Spotify to approve, then back to the page with `?connected=1`.

## Privacy model (v1)

Feeds and now-playing are visible to:
- the owner themselves, OR
- any user with an accepted `friends` edge pointing *to* the owner.

Non-friends see `null` from the viewer queries. Finer-grained visibility
(close-friends only, mutual-friends, public) is a v2 concern that would
attach new fields to `spotifyConnections`.
