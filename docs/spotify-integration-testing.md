# Spotify integration — testing strategy

Testing lives across three layers:

1. **Manual / browser testing** — the primary gate for release. Covers the
   OAuth redirect round-trip (which can't be faithfully simulated), real
   Spotify API responses, and the live now-playing UI.
2. **Convex function tests** — `convex-test` + `vitest` for the dedupe,
   friend-gate, and token-refresh logic. Skips anything that hits the
   Spotify API (mock it).
3. **Static checks** — `pnpm typecheck` and `pnpm lint` on CI. Already
   passing on the worktree branch.

## Pre-flight

Before any manual testing the following must be true:

- [ ] `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI`
      are set on the Convex dev deployment (`npx convex env list | grep SPOTIFY`).
- [ ] `http://localhost:3000/api/spotify/callback` is listed under the app's
      Redirect URIs in the Spotify Developer Dashboard.
- [ ] Your Spotify email is on the **Users and Access** allowlist of the
      Spotify app (apps start in Development Mode, 25-user cap).
- [ ] `npx convex dev` has been run against the worktree at least once so
      the three new tables and two new crons land on the dev deployment.
- [ ] A seeded dev user is selected in the DEV switcher (dev mode) OR
      you're signed into Clerk (prod mode).

## Manual test cases

Each case lists what to do, what to expect, and where to look if it breaks.

### 1. First-time connect (happy path)

1. Visit `/dashboard/integrations`. Integration card shows **Not connected**
   with a **Connect** button.
2. Click **Connect**. Browser redirects to `accounts.spotify.com`; you see
   a consent screen listing the seven scopes.
3. Click **Agree**. Browser redirects back to `/dashboard/integrations?connected=1`.
4. A green **Spotify connected** toast appears.
5. Within ~3 seconds the card flips to **Connected** with the last-sync
   timestamps reading "just now" for Liked, Recent, and Top.
6. Below the card, the **Now playing** pill and the feed tabs appear
   populated (assuming you have listening history).

**Where to look if broken:**
- Browser network tab for the `/api/spotify/callback` redirect — should
  be a 302 to `/dashboard/integrations?connected=1`, not `?error=…`.
- Convex logs for `persistConnection` and `runFullSyncForUser`.

### 2. CSRF guard

1. Open `/dashboard/integrations`, click Connect, land on the Spotify
   consent screen.
2. Copy the URL from the browser address bar; keep the tab open but don't
   click Agree.
3. Open a separate private/incognito tab and paste the URL. Click Agree.
4. The private tab lands on `/dashboard/integrations?error=state_mismatch`
   (the state cookie was set in the first browser, not this one).

The first tab can still complete normally.

### 3. Re-connect after revocation

1. Connect successfully.
2. Go to https://www.spotify.com/account/apps/ and Revoke access for this
   Homie app.
3. In Homie, click **Sync now** on the integration card. Toast reads
   "Reconnect Spotify — permission was revoked" within a few seconds.
4. The card re-renders with an orange "Reconnect needed" badge; the
   **Sync now** button is replaced by **Reconnect**.
5. Click Reconnect, approve on Spotify again. Card returns to green.

**Where to look:** `spotifyConnections.lastError` should be set to
`"reauth_required"` on step 3 and cleared on step 5.

### 4. Manual syncs

For each of Liked / Recent / Top / Now-playing:

1. Note the current count/timestamp on the integrations page for that kind.
2. In another tab, perform the corresponding action on Spotify (like a
   track / play a song / etc.).
3. Click **Sync now** back in Homie.
4. Within ~5s the UI reflects the change.

**Specifically for recent plays:** play a new track on Spotify for >30s,
wait for it to register, then sync. The track should appear at the top of
the Recent tab with "played just now" subtitle.

### 5. Real-time now-playing (demand gate)

This is the one that's easy to get wrong — the sweep is deliberately
demand-gated to save quota.

1. Start playing a track on Spotify. Leave it playing.
2. From a *friend's* account (use the DEV switcher to swap users),
   visit the Spotify owner's profile page (or wherever `NowPlayingPill`
   is mounted with `ownerUserId` set — currently only the self view on
   `/dashboard/integrations`; see "Known integrations not yet wired" below).
3. Within ~30s the pill should populate with the current track. Progress
   bar animates smoothly every second.
4. Navigate away from the profile. Wait 2 minutes.
5. Check Convex logs — `sweepNowPlaying` should have stopped polling this
   user's connection once `watchUntil` expired (~90s after last ping).

**Direct check:** query the `spotifyConnections` row in the Convex
dashboard and watch `watchUntil`. It should sit in the future while a
viewer is on the profile, and fall into the past 90s after the tab closes.

### 6. Friend visibility gate

1. Log in as a user who is **not friends** with another Spotify-connected
   user.
2. Query `api.spotifyFeed.getNowPlayingForViewer` or `listUserTracksForViewer`
   for that user via the Convex dashboard.
3. Both should return `null`.
4. Send and accept a friend request between the two users.
5. Re-run the queries. Both now return data.

### 7. Rate-limit handling

Hard to reproduce on-demand, but verify via code inspection:

- In `convex/spotifySync.ts` the `spotifyGet` helper returns
  `{ status: 429, body: null, retryAfter }` on 429.
- Every sync phase checks `if (status === 429 || !body) break / return`
  and skips writing without updating `lastXSyncAt` — so the next cron
  cycle retries cleanly.

### 8. Disconnect wipes data

1. Connected with populated feed.
2. Note roughly how many liked / recent / top tracks exist in the
   Convex dashboard for your user.
3. Click **Disconnect**, confirm the prompt.
4. Integration card flips to "Not connected"; the feed disappears.
5. In Convex dashboard, verify `spotifyConnections` has no row for you,
   `spotifyUserTracks` has no rows for your userId, and `spotifyNowPlaying`
   has no row for you.

### 9. Dev mode vs prod mode

- **Dev mode** (`NEXT_PUBLIC_DEV_MODE=true`): the Connect button URL
  includes `?devUserId=<id>`; the callback route reads the devUser cookie.
- **Prod mode**: the Connect button URL has no query params; the callback
  route uses `auth()` from `@clerk/nextjs/server` and `getToken({ template: "convex" })`.

Both paths should reach `persistConnection`; the only difference is how
identity is passed.

### 10. Playback

1. Expand a track in the feed. The Spotify embed iframe loads under it.
2. Press play.
   - If you're signed into Spotify as a **Free** user in the browser:
     plays the 30-second preview.
   - If you're signed into Spotify as a **Premium** user: plays the full
     track.
3. Expanding a second track collapses the first (one open at a time).

## Edge cases to verify

- **Track with no preview URL**: `previewUrl` is `undefined` in the row;
  the embed still works because it doesn't rely on our `previewUrl`.
- **Track with no album art**: row has no `albumImageUrl`; the UI falls
  back to a placeholder music icon.
- **User with no listening history**: `Recent` and `Top` tabs show
  "No tracks yet." rather than hanging on a loading state.
- **User clicks Connect twice quickly**: second click overwrites the
  state cookie; the first authorize page's state is now stale and its
  completion lands on `?error=state_mismatch`. Acceptable.
- **Scope change later**: if we add a scope to `SPOTIFY_SCOPES`, existing
  tokens remain valid for the old scopes but the new one requires
  re-auth. The consent screen is forced via `show_dialog=true`, so a
  user clicking Connect a second time will see the new scope.

## Convex function tests (convex-test)

Only the parts that don't call Spotify. Put tests in `convex/spotifyOAuth.test.ts`
and `convex/spotifySync.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { internal } from "./_generated/api"

const modules = import.meta.glob("./**/*.ts")

test("_upsertLikedTracks dedupes by spotifyTrackId", async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test",
      email: "t@x.com",
      dob: "1990-01-01",
      visibility: "friends",
    })
  })
  const item = {
    track: {
      spotifyTrackId: "abc",
      uri: "spotify:track:abc",
      title: "A",
      artists: "B",
    },
    addedAt: 1,
  }
  await t.mutation(internal.spotifySync._upsertLikedTracks, {
    userId,
    items: [item],
  })
  await t.mutation(internal.spotifySync._upsertLikedTracks, {
    userId,
    items: [item],
  })
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("spotifyUserTracks")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", userId).eq("kind", "liked"),
      )
      .collect(),
  )
  expect(rows).toHaveLength(1)
})
```

Priority targets:

- [ ] `_upsertLikedTracks` — second call patches, doesn't insert a duplicate.
- [ ] `_insertRecentTracks` — dedupes by `(trackId, playedAt)` composite,
      not by `trackId` alone.
- [ ] `_replaceKindTracks` — wipes prior rank-volatile rows.
- [ ] `requestNowPlayingPoll` — non-friend sets no `watchUntil`; self
      and friends do.
- [ ] `getNowPlayingForViewer` — returns `null` for non-friend viewers,
      returns the row for friends.
- [ ] `disconnect` — removes connection + all tracks + now-playing row
      for the caller.

## Static checks (CI)

- `pnpm typecheck` — passes on the worktree today.
- `pnpm lint` — run and verify no new warnings in the Spotify files.

## Post-merge smoke test (prod)

Once merged and deployed:

1. Set `SPOTIFY_REDIRECT_URI` on the **prod** Convex deployment with the
   prod URL.
2. Add the prod URL to the Spotify dashboard's redirect URIs.
3. As a prod user on the allowlist, complete the Connect flow once.
4. Verify the Convex logs show `runFullSyncForUser` completing all four
   phases.
5. Check the two new crons (`spotify now-playing sweep`, `spotify scheduled sync`)
   are registered in the Convex dashboard.
