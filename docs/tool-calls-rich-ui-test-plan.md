# Tool Calls & Rich UI — Test Plan

Audience: a tester (agent or engineer) verifying the `vk/tool-calls-rich-ui`
branch end-to-end and filing bug reports. Work through the sections top to
bottom. Anything that doesn't match the "Expected" column should be filed
using the [Reporting template](#7-reporting-template) at the bottom.

---

## 1. Prerequisites

### 1.1 Convex environment variables

Set these via `npx convex env set <NAME> <VALUE>` against the dev deployment.

| Name                          | Where to get it                                                                                      | Missing-key behavior                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GOOGLE_PLACES_API_KEY`       | Google Cloud Console → **Places API (New)** → Credentials                                             | `searchPlaces` tool and profile places search both return `note: "Google Places key not configured"` and render an amber info pill. |
| `SPOTIFY_CLIENT_ID`           | Spotify Developer Dashboard → your app → Client ID                                                    | `searchSongs` tool throws (empty results + Spotify auth error). The card falls back to an empty-state message. |
| `SPOTIFY_CLIENT_SECRET`       | Spotify Developer Dashboard → your app → Client Secret                                                | Same as above.                                                                                        |
| `GOOGLE_GENERATIVE_AI_API_KEY`| Google AI Studio → API Keys                                                                           | `generateAIResponse` throws; the chat turn renders no assistant message.                              |
| `OPENAI_API_KEY`              | OpenAI dashboard (used by `convex/embeddings.ts` for query embeddings)                                | `findFriendPlaces`, `findFriendMedia`, `findFriendProjects`, `findFriendInterests` fail silently (empty hit list). |
| `CLERK_FRONTEND_API_URL`      | Clerk dashboard → API Keys (already set in most environments)                                         | Auth returns null in production, all tools refuse.                                                    |
| `CONVEX_DEV_MODE` (optional)  | Set to `true` to enable the dev user switcher                                                         | Without it, `devUserId` injection is ignored; must sign in via Clerk.                                |

**No key required** (public APIs): OMDb is not used; iTunes, Open Library,
FreeToGame-style searches here actually go via **iTunes Search**, **Open
Library**, **Jikan (MyAnimeList)**, **CheapShark** — none need keys.

### 1.2 Deploy schema + codegen

The new `conversationMessages.parts` optional field and new
`placesSearch.searchPlacesForProfile` action must be pushed before
testing in dev:

```bash
npx convex dev
```

Leave this running — it watches `convex/*.ts` and regenerates
`_generated/api.d.ts` / pushes schema.

### 1.3 Test accounts

Seed or create the following before testing:

- **User A** (your driver account).
- **User B** — friend of A (accepted friendship, tier = `friend`).
- **User C** — close friend of A (tier = `close`).
- **Community X** — both A and B are members. A is admin on at least one
  community to test `listRecentAnnouncements`.
- **Event E1** — future-dated, A is creator, B is invited (RSVP accepted).
- **Event E2** — future-dated, someone else created, A is invited.
- **DM thread** between A and B with at least 3 unread messages on A's side.
- **Announcement** — posted to Community X within the last 7 days.
- **Overlap data** — B's profile has at least 1 Spotify-tagged track that A
  also has; C's profile has 1 movie (`itunes`) overlap with A.

Most of this is handled by `npx convex run devSeed:seedAll` — verify in the
Convex dashboard.

---

## 2. Per-tool test matrix

> Trigger each by sending the sample prompt from User A in
> `/dashboard/homie`. Use DevTools network / the Convex logs to confirm the
> tool fired. All cards render inside the assistant message bubble.

### 2.1 `findFriendsWithSharedMedia`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Which of my friends likes the same music as me?`                                                                              |
| **Card**        | `FriendOverlapCard` (one row per friend).                                                                                      |
| **Fields**      | Friend avatar, name, shared-item count + preview thumbnails (title, external source badge). "Open DM" button.                  |
| **Empty**       | When no overlap exists → empty-state card "No friends with shared music yet".                                                  |
| **Error**       | `OPENAI_API_KEY` missing doesn't affect this tool; DB query returns [] if user has no friends. No key needed.                  |
| **Edges**       | Try `movies`, `books`, `games`, `anime`, `series` domains to ensure the `domain` arg binds correctly.                          |

### 2.2 `findFriendsInCommunity`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Who of my friends is in Community X?`                                                                                         |
| **Card**        | `FriendsInCommunityCard`.                                                                                                      |
| **Fields**      | Friend avatar, name, community role badge (admin/moderator/announcer/member).                                                  |
| **Empty**       | None of A's friends in the community → empty-state "No friends in this community".                                             |
| **Error**       | Community name unresolvable → model should first call `findCommunityByName`; if that fails, expect a plain text apology.       |
| **Edges**       | Community A is not a member of — should be filtered out server-side.                                                           |

### 2.3 `listMyCommunities`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `What communities am I in?`                                                                                                    |
| **Card**        | `CommunityListCard`.                                                                                                           |
| **Fields**      | Cover image, community name, member count, role badge.                                                                         |
| **Empty**       | A not in any community → "No communities yet. Join or discover some to see them here."                                         |
| **Error**       | Convex unreachable → generic error toast; card becomes fallback debug panel.                                                   |
| **Edges**       | Many communities (>10) — confirm grid wraps / does not truncate incorrectly.                                                   |

### 2.4 `findCommunityByName`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Find my community called "runners"`                                                                                            |
| **Card**        | `CommunityListCard` with `emptyTitle: "No matching community"`.                                                                 |
| **Fields**      | Same as above.                                                                                                                  |
| **Empty**       | No fuzzy match → "None of the communities you're in match that name."                                                           |
| **Error**       | Convex unreachable → fallback card.                                                                                             |
| **Edges**       | Case-insensitive match; substring match.                                                                                        |

### 2.5 `getEventRsvpSummary`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `How many people have confirmed for [Event E1]?` (use the exact event name).                                                    |
| **Card**        | `EventRsvpCard`.                                                                                                                |
| **Fields**      | Event title, counts (accepted / declined / maybe / pending), attendee preview row (if user is creator or invitee), "View event" link. |
| **Empty**       | Event with zero RSVPs → all counts = 0, no attendee preview.                                                                    |
| **Error**       | A is neither creator nor invitee → tool returns `error: "not_allowed_or_missing"` → fallback debug card (acceptable).           |
| **Edges**       | Past event (should still work), event in the far future.                                                                        |

### 2.6 `listMyUpcomingEvents`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `What events do I have coming up?`                                                                                              |
| **Card**        | `UpcomingEventsCard`.                                                                                                           |
| **Fields**      | Per event — title, date/time, location (if any), role badge (Host / Invited), cover image.                                      |
| **Empty**       | No upcoming in next 60 days → "Nothing on the calendar right now".                                                              |
| **Error**       | DB timeout → fallback debug card.                                                                                               |
| **Edges**       | Prompt with `in the next 7 days` — the model should pass `withinDays: 7`.                                                       |

### 2.7 `summarizeUnreads`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Summarise my unread messages`                                                                                                  |
| **Card**        | `UnreadsSummaryCard`.                                                                                                           |
| **Fields**      | Per thread — other user avatar, name, unread count badge, up to 3 message previews, "Open chat" button.                         |
| **Empty**       | No unreads → "You're all caught up!".                                                                                           |
| **Error**       | Auth lost mid-call → generic error toast; chat turn errors.                                                                     |
| **Edges**       | Thread where you're both participants (group DM) — ensure other-user resolution picks a stable counterpart.                     |

### 2.8 `listRecentAnnouncements`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Anything new in my communities?`                                                                                               |
| **Card**        | `AnnouncementsCard`.                                                                                                            |
| **Fields**      | Community badge, title, author, createdAt (relative), body snippet, "Open" link.                                                |
| **Empty**       | No recent announcements → empty-state card.                                                                                     |
| **Error**       | Deleted community mid-fetch → row skipped.                                                                                      |
| **Edges**       | Prompt with a specific community name — model should first call `findCommunityByName`, then pass `communityId` here.            |

### 2.9 `searchPlaces`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Find me good ramen near SoHo`                                                                                                  |
| **Card**        | `SearchPlacesCard` (grid of `PlaceCard`).                                                                                       |
| **Fields**      | Photo (if provided), name, type badge, address, rating + count, "Open in Maps" link.                                            |
| **Empty**       | Query with no matches → "No places found. Try a different phrasing or include a neighborhood."                                  |
| **Error**       | `GOOGLE_PLACES_API_KEY` missing → "Place search unavailable / Google Places key not configured".                                |
| **Edges**       | Very long query (>100 chars), non-ASCII query ("東京 ramen").                                                                    |

### 2.10 `searchSongs`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Recommend me some lo-fi tracks`                                                                                                |
| **Card**        | `SearchSongsCard`.                                                                                                              |
| **Fields**      | Album art, title, artist, source badge. Click → opens Spotify link.                                                             |
| **Empty**       | Query with no hits → empty-state.                                                                                               |
| **Error**       | Spotify keys missing → `searchSpotify` throws → renders `ToolErrorCard` ("searchSongs failed").                                 |
| **Edges**       | `kinds: ["album"]` via prompt ("recommend lo-fi albums"); very short query ("sza").                                             |

### 2.11 `searchMovies`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Suggest some thriller movies I might like`                                                                                     |
| **Card**        | `SearchMoviesCard`.                                                                                                             |
| **Fields**      | Poster, title, year, iTunes source badge.                                                                                       |
| **Empty**       | Obscure query → empty-state.                                                                                                    |
| **Error**       | iTunes endpoint down → error card.                                                                                              |
| **Edges**       | Typo in title — iTunes usually still returns something close.                                                                   |

### 2.12 `searchBooks`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Recommend books on climbing`                                                                                                   |
| **Card**        | `SearchBooksCard`.                                                                                                              |
| **Fields**      | Cover (Open Library `covers/id-M.jpg`), title, author, Open Library source badge.                                               |
| **Empty**       | Nonsense query → empty-state.                                                                                                   |
| **Error**       | Open Library 5xx → error card.                                                                                                  |
| **Edges**       | Books without covers render as gradient fallback.                                                                               |

### 2.13 `searchGames`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Any cheap games on sale right now?`                                                                                            |
| **Card**        | `SearchGamesCard`.                                                                                                              |
| **Fields**      | Cover thumb, title, cheapest price (if available), CheapShark source badge.                                                     |
| **Empty**       | Query with no hits → empty-state.                                                                                               |
| **Error**       | CheapShark timeout (8s) → error card.                                                                                           |
| **Edges**       | Franchise query ("zelda") — verify multiple entries render.                                                                     |

### 2.14 `searchAnime`

| Aspect          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt**      | `Recommend me some anime like Frieren`                                                                                          |
| **Card**        | `SearchAnimeCard`.                                                                                                              |
| **Fields**      | Cover image, title, type (TV/Movie/OVA), year, Jikan source badge.                                                              |
| **Empty**       | Nonsense query → empty-state.                                                                                                   |
| **Error**       | Jikan rate-limit (3/s) → error card. Wait 5s and retry.                                                                         |
| **Edges**       | Romanised vs Japanese title — both should resolve.                                                                              |

---

## 3. Rich rendering sanity checks

| Check                                                                                          | Expected                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Plain text markdown still renders: prompt `What's the capital of France?`                      | Bold/italic/lists/links still work via `MessageContent`. No tool cards.                                      |
| Mixed text + one tool call: `Find me ramen in SoHo and add a joke`                             | Assistant bubble renders the joke text **and** the `SearchPlacesCard` in order.                              |
| Multiple tool calls in one turn: `List my communities and my upcoming events`                  | `CommunityListCard` then `UpcomingEventsCard` stacked vertically inside one assistant bubble.                |
| Loading state visible while a tool is executing                                                | While `parts[i].state === "input-available"`, a `RunningTool` placeholder shows (spinner + tool name).       |
| Tool error (e.g. provider timeout)                                                             | `ToolErrorCard` renders (`"<toolName> failed"`), not a crash or blank bubble.                                |
| Existing `homie://event/{id}` inline refs in plain text                                        | Still expand into `<EventCard>` via `MessageContent`.                                                        |
| Existing Spotify / YouTube URL embeds in plain text                                            | Still render iframes via `MessageContent`.                                                                   |
| Legacy messages (rows without `parts`)                                                         | Render via the plain `MessageContent` fallback — no "undefined" or blank bubbles.                            |

---

## 4. Profile Places search flow

Work through in order. Reset the browser tab between runs if needed.

1. **Navigate**: `/dashboard/profile` → scroll to **Favorite Places** section
   → open the accordion.
2. **Verify both entry points**: below the list of place cards you should see
   three buttons in this order:
   - `Add Manually`
   - `Search for a place` (new)
   - `Add from Google Maps` (existing)
3. **Open the search dialog**: click `Search for a place`. Confirm dialog
   title = "Find a Place" and the input is focused automatically.
4. **Debounce**: type `pri` — no request fires. Wait 300 ms — one request
   fires (watch Convex logs for `placesSearch/searchPlacesForProfile`).
5. **Typing fast** (type `prince street pizza` quickly) → no stale results
   ever overwrite the latest (use network tab to verify cancellation).
6. **Results**: pick any row via the **Pick** button. Expect:
   - Toast: `Added "<name>"!`
   - Dialog closes.
   - A new `TexturedCard` appears in the Places grid.
   - Fields auto-filled: `Name`, `Type` (best-guess from Google types), `Google
     Maps Link`, `Address`. Visibility defaults to `friends`. Tags empty.
7. **Save**: click `Save Profile`. Re-load the page → the place persists with
   the populated `mapsLink`.
8. **Empty state**: search `zxqzxqzxq` → expect "No places matched "zxqzxqzxq"".
9. **Missing-key state**: unset `GOOGLE_PLACES_API_KEY`
   (`npx convex env remove GOOGLE_PLACES_API_KEY`), reload, reopen dialog,
   search any term → amber pill: "Google Places key not configured on this
   deployment." No crash. Re-set the key after testing.
10. **Preview link** inside a result row → opens `google.com/maps/…` in a new
    tab. Should not close the dialog.
11. **Regression**: `Add from Google Maps` button still opens the original
    dialog. Paste a short Google Maps URL (`https://maps.app.goo.gl/…`) → place
    is resolved via `parseGoogleMapsLink` and appended.

---

## 5. Regression checks

| # | Flow                                                                                                 | Expected                                                                                 |
| - | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1 | Send a plain chat message (`Hello`) in `/dashboard/homie`                                            | Round-trip works. No tools called. Text renders.                                         |
| 2 | Switch to a business account and chat there                                                          | `generateAIResponse` skips `buildChatTools`, uses business system prompt. Text-only output. |
| 3 | Refresh the chat page                                                                                | Historical messages re-load. Legacy rows (no `parts`) render via text fallback.           |
| 4 | `pnpm typecheck`                                                                                     | Zero errors.                                                                             |
| 5 | `pnpm lint`                                                                                          | Zero new errors (see §6 for pre-existing).                                               |
| 6 | `npx convex dev` running                                                                             | Pushes the new `conversationMessages.parts` optional field + `placesSearch` module.       |
| 7 | Open `/dashboard/profile` with a profile that already has saved places                               | All rendered correctly, visibility badges intact.                                         |

---

## 6. Known / expected warnings (do NOT report)

These are pre-existing and out of scope for this branch. Flag only if the
message changes or new lines appear.

- `components/chat/vapi-integration.tsx` — 6 `@typescript-eslint/no-explicit-any` errors and 1 `react-hooks/set-state-in-effect` error.
- `components/chat/chat-sidebar.tsx` — unused imports `Phone`, `Mic`, `MicOff`.
- `components/chat/user-discovery.tsx` — unused `Filter`, `TabsContent`.
- `components/data-table.tsx` — `react-hooks/incompatible-library` warning on `useReactTable`.
- `components/nav-main.tsx` — unused `Button`, `MailIcon`.
- `convex/_generated/*` — "Unused eslint-disable directive" warnings (autogenerated).
- `convex/embeddingsBackfill.ts` — unused `v`.
- `convex/parseGoogleMapsLink.ts` — `PLACE_TYPES` only used as a type.
- `convex/users.ts` — unused `internalMutation`.
- `convex/vapiHandler.ts` — 2 `no-explicit-any` errors.

---

## 7. Reporting template

When filing an issue, paste this markdown block into a Linear issue or a
`/issues/<slug>.md`:

```markdown
## [tool / card / flow name]

**Repro**
1. …
2. …

**Expected**
<what the Test Plan says should happen, linked row>

**Actual**
<what you saw — include screenshot + network tab details>

**Severity**
- [ ] Blocker (crash, data loss, auth leak)
- [ ] High (broken feature, wrong data shown)
- [ ] Medium (wrong styling, non-ideal empty state)
- [ ] Low (copy nitpick, minor alignment)

**Env**
- Branch: vk/tool-calls-rich-ui @ <short SHA>
- Convex deployment: <dev / prod>
- User: <A / B / C / other>
- Browser: <Chrome 1xx / Safari x / …>
```
