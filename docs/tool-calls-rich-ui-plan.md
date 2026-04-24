# Tool calls + rich UI plan

Branch: `vk/tool-calls-rich-ui`

## 1. Current architecture

### Where the AI call lives
- `convex/ai.ts` → `action generateAIResponse` is the single entry point for the Homie chat page (`app/dashboard/homie/page.tsx`). It uses `@ai-sdk/google` + `generateText`, system-prompts for personal vs business account, and calls `buildAgentTools(ctx, askerId)` for personal accounts.
- `convex/agentTools.ts` exposes four AI-SDK `tool({...})` definitions built on embeddings (`internal.embeddings.searchProfileItems`): `findFriendPlaces`, `findFriendMedia`, `findFriendProjects`, `findFriendInterests`.
- `convex/dmAgent.ts` — agent in a DM drawer. Currently **no tools**, only markdown text.
- `convex/groupChatAgent.ts` — group chat agent. Router + 4 skills (`findHangout`, `pickMovie`, `scheduleEvent`, `general`). The `general` skill uses the same `buildAgentTools`. Other skills just generate text.

### How tool output reaches the UI today
- `generateAIResponse` writes `conversationMessages.content` (string) only — **tool call/result parts are thrown away**. There is no `parts[]`, no `toolCalls`, no `toolResults` persisted for the main Homie chat.
- `components/chat/message-content.tsx` renders the content as markdown with:
  - A homemade `homie://event/{id}` inline ref → `<EventCard>`.
  - YouTube / Spotify iframe embeds from raw URLs.
  - Attachment rendering.
- The chat page (`app/dashboard/homie/page.tsx`) maps messages 1:1 onto a flat `{ id, content, sender, ... }` shape and hands them to `ChatMain` → `MessageContent`. No knowledge of structured parts.

### Data model — already available queries
| Domain | Existing query | Notes |
| --- | --- | --- |
| Friend graph | `internal.friends.getFriendIdsWithTier` | Used by current agent tools. |
| User docs | `internal.users.getUserById` | Doc<"users"> incl. `media`, `places`, `interests`. |
| Events | `api.events.getEventForViewer`, `api.events.listMyEvents` | Visibility-gated. |
| Event invites | `api.eventInvites.listInvitesForEvent`, `api.eventInvites.listPendingInvitesForMe` | Creator sees full roster. |
| Communities | `api.communities.listMyCommunities`, `api.communities.getCommunityForViewer`, `api.communities.discoverCommunities` | Membership queries in `communityMembers.ts`. |
| Community members | `api.communityMembers.listMembers` (admin-only) | Not usable by general chat — need a safer variant. |
| Announcements | `api.communityAnnouncements.listAnnouncements` | Member-gated. |
| DMs | `api.dm.listConversations` (has `unreadCount` per convo), `api.dm.listMessages` | Good for unread summaries. |
| Provider search | `action searchSpotify`, `searchItunes`, `searchOpenLibrary`, `searchJikan`, `searchTvMaze`, `searchCheapShark`, `action parseGoogleMapsLink` | Provider-backed, already return `{title, subtitle, imageUrl}`. |

### Profile items are provider-backed
From `users.media` + `externalSource` / `externalId` + `externalKind`:
  - `spotify` for music (track/album/artist/show)
  - `itunes` for movies
  - `tvmaze` for series
  - `openlibrary` for books/novels
  - `jikan` for anime
  - `cheapshark` for games

So "friends with music in common with me" = intersect `{media items where externalSource="spotify"}` across my accepted friends vs my own.

## 2. What we'll build

### Persisted-part schema change
Rather than the AI-SDK's `UIMessage.parts[]`, we keep the existing `conversationMessages.content` (string) and add a new optional field:

```ts
// convex/schema.ts → conversationMessages
parts: v.optional(v.array(v.object({
  type: v.string(),          // "text" | "tool-<name>"
  text: v.optional(v.string()),
  toolName: v.optional(v.string()),
  input: v.optional(v.string()),   // JSON-stringified args
  output: v.optional(v.string()),  // JSON-stringified result
  state: v.optional(v.string()),   // "input-available" | "output-available" | "output-error"
  errorText: v.optional(v.string()),
}))),
```

`generateAIResponse` now writes `parts` alongside `content`. The UI reads `parts` when present, falls back to plain `content` rendering.

### New tools (added in `convex/agentTools.ts`)

| Tool | Purpose | Returns (UI shape) |
| --- | --- | --- |
| `findFriendsWithSharedMusic` | friends whose Spotify-tracked music overlaps mine | `FriendOverlapResult[]` |
| `findFriendsWithSharedMedia` | same but generic — `domain: "movies"\|"books"\|"games"\|"anime"\|"series"` | `FriendOverlapResult[]` |
| `findFriendsInCommunity` | friends who are also members of a named community | `FriendInCommunityResult[]` |
| `listMyCommunities` | the asker's communities | `CommunityCardData[]` |
| `findCommunityByName` | fuzzy-match a community name to an id | `CommunityCardData[]` |
| `getEventRsvpSummary` | RSVP breakdown for an event (creator-only details else counts) | `EventRsvpSummary` |
| `listMyUpcomingEvents` | upcoming events for asker | `EventCardData[]` |
| `summarizeUnreads` | unread DM threads + preview | `UnreadSummary` |
| `listRecentAnnouncements` | announcements from asker's communities (optionally one community) | `AnnouncementCardData[]` |
| `searchPlaces` | Google Places Text Search via new lib wrapper | `PlaceCardData[]` |
| `searchSongs` | Spotify tracks | `SongCardData[]` |
| `searchMovies` | iTunes | `MovieCardData[]` |
| `searchBooks` | Open Library | `BookCardData[]` |
| `searchGames` | CheapShark | `GameCardData[]` |
| `searchAnime` | Jikan | `AnimeCardData[]` |

Each `execute()` returns a JSON-serialisable object that matches the card's props. The UI has a tool-name → component map.

### New Convex queries / helpers (only what doesn't already exist)

- `internal.users.listUsersByIds` — batch-get `Doc<"users">[]` for enrichment.
- `internal.communities.findCommunityByNameForUser` — return communities the asker is a member of whose name substring-matches a query.
- `internal.communities.listMyMembershipsInternal` — internal wrapper around listMyCommunities for actions.
- `internal.communityAnnouncements.listRecentForUser` — recent announcements across every community the asker is a member of, sorted by recency.
- `internal.eventInvites.getRsvpSummaryInternal` — counts by status + small preview roster (name, avatar) regardless of viewer (the tool enforces asker is creator or invitee before returning detailed rosters).
- `internal.events.listUpcomingForUserInternal` — asker's upcoming events (creator OR invitee) within N days.
- `internal.dm.summarizeUnreadsInternal` — per-conversation unread preview (thread name, unread count, last 3 messages) for the asker.
- `internal.friends.listFriendsWithMediaOverlapInternal` — given asker + externalSource, return friends + shared items. Enforces `canView` visibility via `allowedVisibilities` (same rule as agentTools).

All added to existing files (`users.ts`, `communities.ts`, etc) — no new modules.

### New card components (`components/chat/tool-cards/`)
- `ToolPartRenderer.tsx` — top-level switch on `part.toolName`. Handles loading (`input-available`), error (`output-error`), and unknown tools (collapsible debug panel).
- `FriendOverlapCard.tsx` — avatar, name, shared-item count & preview; "Open DM" button.
- `FriendGrid.tsx` — renders multiple `FriendOverlapCard`.
- `CommunityPreviewCard.tsx` — a compact variant that wraps the existing `<CommunityCard>` for inline chat use.
- `CommunityGrid.tsx`.
- `EventRsvpCard.tsx` — counts + preview attendees + "view event" link.
- `UpcomingEventsList.tsx` — list of `<EventCard>` (reuse existing).
- `AnnouncementCard.tsx` — community badge, title, author, createdAt, snippet, link.
- `UnreadsSummaryCard.tsx` — per-thread: avatar, name, unread count, preview, "Open chat".
- `PlaceCard.tsx` — image (cover), name, address, type badge, "Open in Maps", "Save to profile" (TODO hook).
- `SongCard.tsx` — album art, title, artist, embedded Spotify iframe if `kind===track`, "Add to profile" button.
- `MovieCard.tsx` / `BookCard.tsx` / `GameCard.tsx` / `AnimeCard.tsx` — art + title + subtitle + source badge + action.
- `MediaGrid.tsx` — compact grid for multi-result provider lists.

Styling: reuse shadcn Card / Badge / Button / Avatar; match tailwind tokens used by existing `CommunityCard`/`EventCard`.

### Wiring
- `convex/ai.ts`: broaden `buildAgentTools` to `buildPersonalTools` (new file export). Pipe the returned `result.response.messages` parts (the AI-SDK v5+ shape is `result.response.messages[-1].content` but the easier path is `stepCountIs + onStepFinish` to collect `toolResults`) → stringify into the `parts` field.
- `app/dashboard/homie/page.tsx`: map `conversationMessage.parts` into the UI `Message` shape; pass through to `ChatMain`.
- `components/chat/chat-main.tsx`: when a message has `parts`, render via the new `ToolPartRenderer`; else fall back to the existing `<MessageContent>`.
- System prompt addendum listing every tool and when to use it ("when the user asks about places, ALWAYS call `searchPlaces` — never describe in prose").

### Migration notes
- Adding `parts` as optional on `conversationMessages` keeps old rows valid (Convex guideline: new fields must be optional for backward compat).
- Existing `findFriendPlaces` / `findFriendMedia` / `findFriendProjects` / `findFriendInterests` are retained — their return shape is already card-friendly.
- No schema removals.

## 3. Phased implementation order

1. Schema: add optional `parts[]` to `conversationMessages`.
2. New internal queries (users, communities, eventInvites, events, dm, friends, announcements).
3. New tool definitions in `agentTools.ts`.
4. Update `convex/ai.ts` to persist `parts` via `onStepFinish`.
5. Build `ToolPartRenderer` + individual cards.
6. Wire renderer into chat page.
7. Typecheck + lint.
