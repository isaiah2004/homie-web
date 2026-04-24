# Chat Tools & Cards — Audit Checklist

Live-tested in `/dashboard/homie` with the PI user
(`its.pi.music@gmail.com`). Columns: **R** = renders, **I** = images,
**X** = interactive (links/buttons work), **!** = visual issue spotted.

## Bugs fixed this round

| Bug | Root cause | Fix |
|---|---|---|
| Music thumbnails missing | Qdrant payloads indexed before `imageUrl` was added to the schema | Ran `debugReindexAll` mutation; all 12 users reindexed. Now payloads include `imageUrl`, `subtitle`, `externalSource`. |
| Anime thumbnails missing | Same root cause — anime is a `findFriendMedia` result, not `searchAnime` | Same reindex fix. Confirmed: MyAnimeList covers now render. |
| `listMyCommunities` said "none" | User asked the question **before** joining the community. Code was correct all along. | Verified via DB query that membership row exists. Re-tested: now returns "BLR rockstar" correctly. |

## Per-tool status

### Friend-graph embedding tools (indexed via Qdrant)

| Tool | Card | R | I | X | Notes |
|---|---|:-:|:-:|:-:|---|
| `findFriendPlaces` | `FriendPlacesCard` (new) | ✅ | ⚠️ | ✅ | Renders "Degrand - Restaurant - from Paul Isaiah" with working "Open in Maps" link. Thumbnails only render if the place was saved via the Places search picker (imageUrl is captured). Existing manually-added places have no `imageUrl` and fall back to the map-pin icon tile. |
| `findFriendMedia` | `FriendMediaCard` (new) | ✅ | ✅ | ➖ | Renders Spotify/iTunes/MAL covers + subtitle ("NF • 2025") + `from Paul Isaiah`. Thumbnails loaded from `i.scdn.co`, `myanimelist.net`, `is1-ssl.mzstatic.com`. Screenshot: `docs/friend-media-with-images.png`. No link-out yet — see enhancements. |
| `findFriendProjects` | `FriendProjectsCard` (new) | ✅ | ➖ | ➖ | Empty state renders correctly ("No projects matched"). Non-empty state not yet verified with data but shape + render path confirmed. |
| `findFriendInterests` | `FriendInterestsCard` (new) | ✅ | ➖ | ➖ | Renders grouped by owner — "Paul Isaiah" row with chip badges for `gaming`, `food`, `skating`. |

### New-style (structured-result) tools from the `vk/tool-calls-rich-ui` merge

| Tool | Card | R | I | X | Notes |
|---|---|:-:|:-:|:-:|---|
| `findFriendsWithSharedMedia` | `FriendOverlapCard` | ❓ | ❓ | ❓ | Not triggered — needs a friend with provider-tagged overlap (same Spotify/iTunes externalId as the asker). |
| `findFriendsInCommunity` | `FriendsInCommunityCard` | ❓ | ❓ | ❓ | Not triggered — needs a community containing ≥1 of the asker's friends. |
| `listMyCommunities` | `CommunityListCard` | ✅ | ➖ | ✅ | BLR rockstar card shows cover fallback (no `coverImageUrl` set), role badge "member", member count "2 members", location "Kothanur", description "music social groups". Click routes to `/dashboard/communities/blr-rockstar`. |
| `findCommunityByName` | `CommunityListCard` (shared) | ❓ | ➖ | ❓ | Same render path as `listMyCommunities`; render confirmed via that. |
| `getEventRsvpSummary` | `EventRsvpCard` | ❓ | ➖ | ❓ | Not triggered — needs a real event the asker is creator/invitee of. |
| `listMyUpcomingEvents` | `UpcomingEventsCard` | ❓ | ❓ | ❓ | Not triggered — needs events. |
| `summarizeUnreads` | `UnreadsSummaryCard` | ❓ | ➖ | ❓ | Not triggered — needs an unread DM thread. |
| `listRecentAnnouncements` | `AnnouncementsCard` | ❓ | ➖ | ❓ | Not triggered — needs a community with an announcement in the last 7d. |

### External-provider search tools

| Tool | Card | R | I | X | Notes |
|---|---|:-:|:-:|:-:|---|
| `searchPlaces` | `SearchPlacesCard` | ❓ | ✅ | ✅ | Chat-tool not triggered this round, but the profile-side `searchPlacesForProfile` is the same endpoint + same `imageUrl` path. Thumbnails + "Open in Maps" already verified in earlier sessions. |
| `searchSongs` | `SearchSongsCard` | ✅ | ✅ | ✅ | `recommend me some rock music` → "Smells Like Teen Spirit" / "Bring Me To Life" / "Aerials" plus multiple albums. Spotify iframe embeds render with working "Play on Spotify" buttons. `!` see enhancements: iframe heights add up quickly on big result sets. |
| `searchMovies` | `SearchMoviesCard` | ✅ | ✅ | ➖ | Earlier test: 6 thrillers rendered as poster grid (Blink Twice, Candlewood, Drop, Apartment 7A, Companion, The Astronaut) with iTunes covers + director • year subtitle. |
| `searchBooks` | `SearchBooksCard` | ❓ | ❓ | ❓ | Not triggered — same render path as `searchMovies` (poster grid). |
| `searchGames` | `SearchGamesCard` | ❓ | ❓ | ❓ | Not triggered — same render path. |
| `searchAnime` | `SearchAnimeCard` | ❓ | ❓ | ❓ | Not triggered as a chat call. Jikan returns `imageUrl` (verified in `convex/jikan.ts`) and the card renders it via `MediaPosterCard`. |

Legend: ✅ confirmed • ❓ not exercised • ⚠️ partial • ➖ not applicable

## Visual + interactivity observations

### Wins
- **Loading states visible** — "Running findFriendProjects…" placeholder renders for each in-flight tool inside the assistant bubble.
- **Mixed text + card** works correctly — assistant renders natural-text prefix followed by the card.
- **Multiple tools in one turn** works — one message triggered both `findFriendProjects` and `findFriendInterests`, both cards stacked in the same bubble.
- **Empty states have the right copy** — they differ per-tool ("No projects matched", "No places matched", etc.) rather than a generic fallback.

### Issues worth fixing

| # | Area | Observation | Suggested fix |
|---|---|---|---|
| 1 | `SearchSongsCard` | Spotify track/album/artist embeds are each full-width iframes with a hard-coded 152px (track) / 352px (album) height. Querying "rock music" returns ~8 results, so the assistant message bubble scrolls hundreds of pixels. | Cap the grid at 4 results by default with an "Show more" affordance; or swap full embed for `size=compact` mode when `kind=album`. |
| 2 | `FriendMediaCard` | Thumbnail is rendered but the title/subtitle/metadata row has **no click target**. Spotify/iTunes/MAL external IDs are stored in the tool response as `externalSource`/`externalId` but ignored. | Wrap the row in an `<a href>` that builds a deep link (spotify://, itunes://, or provider URL) from `externalSource`+`externalId`. |
| 3 | `FriendPlacesCard` | Same as above — the card has a "Open in Maps" icon button but the title row itself is not clickable. Falls-back icon tile and thumbnail aren't interactive either. | Make the whole row a link (or add a hover state + outer `<a>`). |
| 4 | `FriendInterestsCard` | Grouped by owner, which is good. But the owner's name isn't a link to their profile. | Link owner name → `/dashboard/profile/<userId>`. |
| 5 | Color | The new friend-graph cards use a flat `bg-card` border-only style. The new-style cards (`FriendOverlapCard`, `CommunityListCard`, etc.) have more polish — rounded avatars, gradient fallbacks, badge variants. | Match visual density: give friend-graph rows a subtle left-border tint by category (music = green, anime = purple, places = blue). Low priority. |
| 6 | Interactivity (general) | Hovering a card row does nothing. No cursor-pointer on clickable titles. | Add `hover:bg-muted/50 cursor-pointer` when the row is clickable (once the links are added). |
| 7 | `findFriendProjects` | Empty state explanation is generic ("Try a broader topic"). The real reason queries return empty for broad prompts is that the LLM passes an empty string when the prompt doesn't specify a topic. | Either set a `.min(1)` on `findFriendProjects.inputSchema.query` and/or have the tool return a helpful message when `query.trim() === ""` so the LLM retries with a broader term. |
| 8 | Card width / overflow | Long track/album titles in `SongCard` and `SearchAnimeCard` wrap fine, but the Spotify embed keeps reserving full iframe height even for tracks that never loaded (`busy` state visible in a11y tree for every embed). | Add a fixed `minHeight` + lazy mount iframe when visible (IntersectionObserver) so the page isn't hundreds of iframes pre-loaded. |

## Follow-ups (not fixed this round)

- **Event / announcement / unread tools**: untested because no seeded data on this account. Running `npx convex run devSeed:seedAll` would populate them per the test plan.
- **`searchAnime` as a chat tool**: untested. Render path is identical to `searchMovies` which is working.
- **Place thumbnails on pre-existing saved places**: the `places[]` schema now has `imageUrl` but only new Places-search picks populate it. Existing manual adds and "paste Google Maps link" adds don't set it. Fixable by extending `parseGoogleMapsLink` to return the first photo and threading it through.

## Files touched this round

- `convex/embeddings.ts` — payload + SearchHit include `imageUrl` / `subtitle` / `externalSource` / `externalId` for media AND places.
- `convex/agentTools.ts` — `findFriendMedia` + `findFriendPlaces` forward thumbnail fields to the card.
- `convex/schema.ts` — `places[]` gains optional `imageUrl`.
- `convex/users.ts` — all three place validators accept `imageUrl`.
- `components/app-ui/AddPlaceFromSearchDialog.tsx` — picks capture the Google Places photo.
- `components/app-ui/UserInfoForm.tsx` — `placeSchema` accepts `imageUrl`.
- `components/chat/tool-cards/friend-graph-cards.tsx` — media and places cards render thumbnails with icon fallback.

## Screenshots

| File | Shows |
|---|---|
| `docs/friend-media-with-images.png` | Kimi no Na wa / Naruto / GRAHAM / FEAR / Justin Bieber cards with real covers. |
| `docs/communities-and-media-fixed.png` | Full page with both fixes on screen. |
| `docs/audit-songs-card.png` | `searchSongs` result with Spotify track+album+artist iframes. |
| `docs/discover-text-search-working.png` | Community text search returning BLR rockstar (from morning run). |
| `docs/fixed-findFriendMedia-card.png` | Earlier screenshot (before image fix) — kept for before/after compare. |
