import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Visibility types
const visibilityEnum = v.union(
  v.literal("close"),
  v.literal("friends"),
  v.literal("mutual"),
  v.literal("none")
);

// Conversation types
const conversationTypeEnum = v.union(
  v.literal("text"),
  v.literal("audio"),
  v.literal("hybrid")
);

// Message roles for Vercel AI SDK
const messageRoleEnum = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system")
);

// VAPI call status
const vapiCallStatusEnum = v.union(
  v.literal("initiated"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed")
);

// Metadata value type (replaces v.any())
const metadataValue = v.union(v.string(), v.number(), v.boolean(), v.null());

// External content provider for items attached to a profile (songs, movies,
// books, games, etc). A missing value means the item is a free-text entry
// the user typed themselves with no provider-backed id.
const externalSourceEnum = v.union(
  v.literal("spotify"),
  v.literal("itunes"),
  v.literal("tvmaze"),
  v.literal("openlibrary"),
  v.literal("jikan"),
  v.literal("cheapshark"),
);

// Account type. Controls which variant of the app a user sees:
//   - "personal" (default) — the full consumer experience: Friends,
//     Communities, Events, Homie chat, personal profile, ad/coupons.
//   - "business" — a curated workspace: outreach-focused Homie chat,
//     business-profile settings (contact, services, branches), org chat
//     with managers/employees, ads. Personal surfaces (Friends, Communities)
//     are hidden.
// Stored on `users` so a single Convex row is enough to branch the UI; the
// distinction is set at signup via the Clerk flow and is immutable afterward
// (a user can still join any `businesses` they're invited to regardless of
// accountType — accountType is about the *signup intent*, not permissions).
const accountTypeEnum = v.union(
  v.literal("personal"),
  v.literal("business"),
);

// User profiles table
export const users = defineTable({
  name: v.string(),
  email: v.string(),
  // Mirror of Clerk's username. Optional because a Clerk user may not have one
  // set yet; only users with a username are discoverable via search.
  username: v.optional(v.string()),
  // accountType is optional to preserve backward compatibility with rows
  // created before this field existed — readers MUST default to "personal"
  // when the field is absent. New rows should always pass it explicitly.
  accountType: v.optional(accountTypeEnum),
  dob: v.string(),
  avatar: v.optional(v.string()),
  bio: v.optional(v.string()),
  location: v.optional(v.string()),
  visibility: visibilityEnum,
  currentStatus: v.optional(v.array(v.union(v.literal("work"), v.literal("study")))),
  
  // Complex nested structures matching the form
  interests: v.optional(v.array(v.object({
    value: v.string(),
    visibility: visibilityEnum,
  }))),

  eventInterests: v.optional(
    v.array(
      v.object({
        value: v.string(),
        custom: v.boolean(),
        visibility: visibilityEnum,
      })
    )
  ),

  media: v.optional(v.array(v.object({
    title: v.string(),
    type: v.union(
      v.literal("music"),
      v.literal("movie"),
      v.literal("book"),
      v.literal("novel"),
      v.literal("series"),
      v.literal("podcast"),
      v.literal("anime"),
      v.literal("game"),
      v.literal("other")
    ),
    visibility: visibilityEnum,
    // Provider-backed item metadata. All optional so legacy free-text entries
    // remain valid. `externalKind` disambiguates within a source (Spotify
    // returns track|album|artist|show under the same "music"/"podcast" type).
    externalSource: v.optional(externalSourceEnum),
    externalId: v.optional(v.string()),
    externalKind: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }))),
  
  places: v.optional(v.array(v.object({
    name: v.string(),
    type: v.union(
      v.literal("restaurant"),
      v.literal("cafe"),
      v.literal("bar"),
      v.literal("park"),
      v.literal("gym"),
      v.literal("library"),
      v.literal("store"),
      v.literal("hangout"),
      v.literal("other")
    ),
    mapsLink: v.optional(v.string()),
    address: v.optional(v.string()),
    tags: v.array(v.string()),
    visibility: visibilityEnum,
    imageUrl: v.optional(v.string()),
  }))),
  
  projects: v.optional(v.array(v.object({
    title: v.string(),
    tags: v.array(v.string()),
    description: v.optional(v.string()),
    visibility: visibilityEnum,
  }))),
  
  workplace: v.optional(v.object({
    name: v.optional(v.string()),
    mapsLink: v.optional(v.string()),
    visibility: v.union(v.literal("close"), v.literal("none")),
  })),
  
  school: v.optional(v.object({
    name: v.optional(v.string()),
    mapsLink: v.optional(v.string()),
    visibility: v.union(v.literal("close"), v.literal("none")),
  })),
})
  .index("email", ["email"])
  .index("by_username", ["username"]);

// Friends table
//
// Mirror-row design: every friendship is represented by TWO rows (one per
// direction). `userId` is the row owner; `friendId` is the other party.
// Both rows are created together on request, flipped together on accept,
// and deleted together on decline/cancel/remove.
//
// `tier` is owner-side only: Alice may mark Bob as "close" without Bob
// reciprocating. It is only meaningful when `status === "accepted"`.
//
// "mutual" is NOT a stored tier — it is a derived read-time state meaning
// "shares at least one accepted friend with the owner" and is computed on
// demand in the visibility helpers.
export const friends = defineTable({
  userId: v.id("users"),
  friendId: v.id("users"),
  status: v.union(v.literal("pending"), v.literal("accepted")),
  tier: v.union(v.literal("close"), v.literal("friend")),
  requestedBy: v.id("users"),
  addedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_friend", ["friendId"])
  .index("by_user_and_friend", ["userId", "friendId"])
  .index("by_user_and_status", ["userId", "status"]);

// Messages table (legacy user-to-user messaging — superseded by
// dmConversations/directMessages below; kept for backward compatibility
// in case any callers still reference it).
export const messages = defineTable({
  from: v.id("users"),
  to: v.id("users"),
  content: v.string(),
  type: v.union(v.literal("message"), v.literal("question"), v.literal("request")),
  priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  timestamp: v.number(),
  read: v.boolean(),
}).index("to", ["to"]).index("from", ["from"]);

// Direct-message conversations (one row per friend pair).
//
// Invariant: `userAId < userBId` lexicographically so a pair maps to exactly
// one row. Use the helper `sortedPair` in convex/dm.ts when writing.
export const dmConversations = defineTable({
  userAId: v.id("users"),
  userBId: v.id("users"),
  lastMessageAt: v.number(),
  lastPreview: v.optional(v.string()),
})
  .index("by_pair", ["userAId", "userBId"])
  .index("by_userA", ["userAId", "lastMessageAt"])
  .index("by_userB", ["userBId", "lastMessageAt"]);

// Direct messages between two users.
//
// `author`:
//   "user"  — composed by the human at `from`.
//   "agent" — content was generated by `from`'s Homie agent and explicitly
//             shared into the chat by the user (via "share with friend").
// `mentionsAgent`: true when the sender's original composer contained
//   `@homie` (or legacy `@agent`). Used only for the pill render on the
//   sender's side; a mention never routes the message to the recipient
//   by itself — mentions trigger a private agent response (see
//   agentChatResponses) that the user can choose to share.
// `format`:
//   "plain"    — legacy bare-text content (default when absent).
//   "markdown" — markdown content (agent responses).
//   "html"     — sanitized Tiptap-produced HTML (rich composer).
// `attachmentIds`: optional list of attachments table ids uploaded via R2.
export const directMessages = defineTable({
  conversationId: v.id("dmConversations"),
  from: v.id("users"),
  to: v.id("users"),
  content: v.string(),
  author: v.union(v.literal("user"), v.literal("agent")),
  mentionsAgent: v.boolean(),
  format: v.optional(
    v.union(
      v.literal("plain"),
      v.literal("markdown"),
      v.literal("html"),
    ),
  ),
  attachmentIds: v.optional(v.array(v.id("attachments"))),
  sentAt: v.number(),
  readAt: v.optional(v.number()),
})
  .index("by_conversation", ["conversationId", "sentAt"])
  .index("by_to_and_read", ["to", "readAt"]);

// Attachments uploaded to Cloudflare R2 and referenced from messages.
// `kind` classifies the media for rendering (image/video/pdf/doc/other).
// `publicUrl` is derived from R2_PUBLIC_BASE_URL at upload time; stored so
// messages can be rendered without re-fetching the env var.
export const attachments = defineTable({
  userId: v.id("users"),
  key: v.string(),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
  publicUrl: v.string(),
  kind: v.union(
    v.literal("image"),
    v.literal("video"),
    v.literal("pdf"),
    v.literal("doc"),
    v.literal("other"),
  ),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_user", ["userId", "createdAt"])
  .index("by_key", ["key"]);

// Agent responses to private `@agent` queries.
//
// Visible only to `askerId` until they click "share with friend", at which
// point a `directMessages` row with `author: "agent"` is inserted and its id
// is recorded as `sharedAsMessageId`.
export const agentChatResponses = defineTable({
  conversationId: v.id("dmConversations"),
  askerId: v.id("users"),
  query: v.string(),
  content: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("ready"),
    v.literal("failed"),
  ),
  error: v.optional(v.string()),
  createdAt: v.number(),
  sharedAsMessageId: v.optional(v.id("directMessages")),
})
  .index("by_conversation_and_asker", ["conversationId", "askerId", "createdAt"]);

// NEW: Conversations table (AI chat sessions)
export const conversations = defineTable({
  userId: v.id("users"),
  title: v.optional(v.string()), // Made optional with default in app logic
  type: conversationTypeEnum,
  model: v.optional(v.string()), // AI model used (e.g., "gpt-4", "claude-3")
  systemPrompt: v.optional(v.string()), // Custom system prompt for the conversation
  isActive: v.boolean(), // Whether conversation is active/archived
  metadata: v.optional(v.record(v.string(), metadataValue)), // Fixed: replaced v.any()
})
  .index("by_user", ["userId"])
  .index("by_user_and_active", ["userId", "isActive"])
  .index("by_user_and_type", ["userId", "type"]); // NEW: filter by conversation type

// NEW: Conversation messages table (Vercel AI SDK compatible)
export const conversationMessages = defineTable({
  conversationId: v.id("conversations"),
  role: messageRoleEnum,
  content: v.optional(v.string()), // Fixed: made optional for tool-only responses
  attachments: v.optional(v.array(v.object({
    type: v.union(v.literal("image"), v.literal("file")),
    url: v.string(),
    name: v.optional(v.string()),
  }))),
  // AI metadata
  model: v.optional(v.string()),
  tokens: v.optional(v.object({
    prompt: v.optional(v.number()),
    completion: v.optional(v.number()),
    total: v.optional(v.number()),
  })),
  finishReason: v.optional(v.string()), // "stop", "length", "content_filter", etc.
  toolCalls: v.optional(v.array(v.object({
    name: v.string(),
    arguments: v.string(),
  }))),
  // Rich UI parts — AI-SDK-style tool invocations persisted so the chat UI
  // can render dedicated cards for each tool instead of collapsing the
  // assistant turn into plain text. `type` is either "text" or
  // "tool-<name>". For tool parts `input` / `output` are JSON-stringified
  // so Convex's validator doesn't need to know each tool's exact shape.
  // Added as optional for backward compatibility with rows predating this
  // feature.
  parts: v.optional(
    v.array(
      v.object({
        type: v.string(),
        text: v.optional(v.string()),
        toolName: v.optional(v.string()),
        toolCallId: v.optional(v.string()),
        input: v.optional(v.string()),
        output: v.optional(v.string()),
        state: v.optional(
          v.union(
            v.literal("input-available"),
            v.literal("output-available"),
            v.literal("output-error"),
          ),
        ),
        errorText: v.optional(v.string()),
      }),
    ),
  ),
})
  .index("by_conversation", ["conversationId"])
  .index("by_conversation_and_role", ["conversationId", "role"]); // NEW: efficient role filtering

// NEW: VAPI audio calls table
export const vapiCalls = defineTable({
  conversationId: v.optional(v.id("conversations")), // Optional: can exist without conversation
  userId: v.id("users"),
  status: vapiCallStatusEnum,
  vapiCallId: v.string(), // Fixed: made required for tracking
  phoneNumber: v.optional(v.string()), // Phone number if inbound/outbound call
  direction: v.union(v.literal("inbound"), v.literal("outbound")), // Call direction
  
  // Audio storage
  audioUrl: v.optional(v.id("_storage")), // Convex storage ID for audio recording
  audioDuration: v.optional(v.number()), // Duration in seconds
  
  // Transcript
  transcript: v.optional(v.string()), // Full transcript of the call
  
  // Timing
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  
  // Metadata
  metadata: v.optional(v.record(v.string(), metadataValue)), // Fixed: replaced v.any()
})
  .index("by_user", ["userId"])
  .index("by_conversation", ["conversationId"])
  .index("by_status", ["status"])
  .index("by_user_and_status", ["userId", "status"])
  .index("by_user_and_startedAt", ["userId", "startedAt"]); // NEW: time-based queries

// Cached Spotify client-credentials access token. Exactly one row is kept;
// the token is refreshed on demand when it is missing or within its skew
// window of expiry. Stored in a table (rather than in-memory) because
// Convex actions are stateless across invocations.
export const spotifyAuth = defineTable({
  accessToken: v.string(),
  // Absolute epoch-ms at which the token expires.
  expiresAt: v.number(),
});

// Per-user Spotify OAuth connection. One row per user that has linked their
// Spotify account. Separate from `spotifyAuth` (which is the app-level
// client-credentials token used for catalog search) because user-scoped
// endpoints need Authorization Code tokens with a refresh token.
//
// `watchUntil` is the demand-gate for now-playing polling — when a viewer
// opens this user's profile we bump it to now + 90s. The now-playing sweep
// cron only polls connections whose `watchUntil > now`, so idle users don't
// burn quota.
//
// `lastError: "reauth_required"` means the stored refresh token was rejected
// (user revoked access on Spotify's end). The UI shows a Reconnect CTA; any
// other non-empty string is a recoverable sync error.
export const spotifyConnections = defineTable({
  userId: v.id("users"),
  spotifyUserId: v.string(),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.number(),
  scopes: v.array(v.string()),
  connectedAt: v.number(),
  lastLikedSyncAt: v.optional(v.number()),
  lastRecentSyncAt: v.optional(v.number()),
  lastTopSyncAt: v.optional(v.number()),
  lastNowPlayingAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  watchUntil: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_watchUntil", ["watchUntil"]);

// Tracks synced from Spotify, discriminated by `kind`.
//   - "liked"        — saved-tracks library; ordered by `addedAt` desc.
//   - "recent"       — recently played history; ordered by `playedAt` desc.
//     A single track can appear multiple times (different `playedAt`).
//   - "top_short"    — top tracks, last ~4 weeks; ordered by `rank` asc.
//   - "top_medium"   — top tracks, last ~6 months.
//   - "top_long"     — top tracks, last ~1 year.
//
// Dedupe key for liked/top: (userId, kind, spotifyTrackId).
// Dedupe key for recent: (userId, kind, spotifyTrackId, playedAt).
// Top-* rows are wiped and re-inserted on each sync (rank is volatile).
export const spotifyUserTracks = defineTable({
  userId: v.id("users"),
  kind: v.union(
    v.literal("liked"),
    v.literal("recent"),
    v.literal("top_short"),
    v.literal("top_medium"),
    v.literal("top_long"),
  ),
  spotifyTrackId: v.string(),
  uri: v.string(),
  title: v.string(),
  artists: v.string(),
  albumImageUrl: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
  playedAt: v.optional(v.number()),
  addedAt: v.optional(v.number()),
  rank: v.optional(v.number()),
  syncedAt: v.number(),
})
  .index("by_user_and_kind", ["userId", "kind"])
  .index("by_user_kind_and_track", ["userId", "kind", "spotifyTrackId"]);

// Current playback state for each connected user. One row per user. Updated
// by `sweepNowPlaying` while `spotifyConnections.watchUntil > now`. When
// nobody is watching, the row stays stale (its `fetchedAt` shows how stale).
//
// `isPlaying: false` with everything else populated means "paused on this
// track at this position" — the UI can still render a "last played" card.
// Missing track fields + `isPlaying: false` means "nothing is loaded".
export const spotifyNowPlaying = defineTable({
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
}).index("by_user", ["userId"]);

// Cross-cutting notifications table. Shared by events (PR #4), communities
// (PR #6), businesses (PR #7), and ads (PR #8). The `type` union enumerates
// every notification kind up-front so no future schema migration is needed
// when later PRs start emitting their own rows.
//
// `meta` is a freeform record for PR-specific fields (e.g. eventId, inviteId)
// that the link target / UI may want without widening the schema.
export const notifications = defineTable({
  userId: v.id("users"),
  type: v.union(
    v.literal("event_invite"),
    v.literal("event_accepted"),
    v.literal("event_declined"),
    v.literal("event_cancelled"),
    v.literal("event_updated"),
    // Placeholders for PRs #5/#6/#7/#8 — declared now so future features
    // don't need a schema migration. Unused today but valid.
    v.literal("community_join_request"),
    v.literal("community_request_accepted"),
    v.literal("community_request_declined"),
    v.literal("community_announcement"),
    v.literal("community_role_changed"),
    v.literal("community_removed"),
    v.literal("business_member_invite"),
    v.literal("business_role_changed"),
    v.literal("ad_approved"),
    v.literal("ad_rejected"),
  ),
  title: v.string(),
  body: v.optional(v.string()),
  link: v.optional(v.string()),
  read: v.boolean(),
  createdAt: v.number(),
  meta: v.optional(v.record(v.string(), v.any())),
})
  .index("by_user_and_createdAt", ["userId", "createdAt"])
  .index("by_user_and_read", ["userId", "read"]);

// Events table. `visibility` gates `getEventForViewer`:
//   - "public"   — any authenticated user may read
//   - "friends"  — only accepted friends of creator (or creator themselves)
//   - "invitees" — only rows present in `eventInvites` for this event (or creator)
//
// `groupChatRef` is a loose string reference (not v.id("groupChats")) because
// group chats don't exist yet — will be introduced in PR #3. Keeping the
// column here avoids a follow-up schema migration when that PR ships.
//
// `communityId` (added in PR #6) links an event to a community. When set,
// the event's visibility is further constrained to community members via
// `listEventsForCommunity` — the existing `visibility` gate still applies
// to the generic listing paths.
export const events = defineTable({
  createdBy: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  locationName: v.optional(v.string()),
  locationAddress: v.optional(v.string()),
  locationMapsLink: v.optional(v.string()),
  locationLat: v.optional(v.number()),
  locationLng: v.optional(v.number()),
  visibility: v.union(
    v.literal("public"),
    v.literal("friends"),
    v.literal("invitees"),
  ),
  coverImageUrl: v.optional(v.string()),
  // Group-chat click-through target. See comment above for why this is a
  // string today.
  groupChatRef: v.optional(v.string()),
  communityId: v.optional(v.id("communities")),
  status: v.union(
    v.literal("scheduled"),
    v.literal("cancelled"),
    v.literal("completed"),
  ),
  createdAt: v.number(),
})
  .index("by_creator", ["createdBy"])
  .index("by_startsAt", ["startsAt"])
  .index("by_status_and_startsAt", ["status", "startsAt"])
  .index("by_community_and_startsAt", ["communityId", "startsAt"]);

// Event invites. One row per (event, invitee). Status drives the RSVP UI;
// `respondedAt` is null while `status === "pending"`. Creator-side access
// through `by_event`; invitee-side through `by_invitee` / `by_invitee_and_status`.
export const eventInvites = defineTable({
  eventId: v.id("events"),
  inviterId: v.id("users"),
  inviteeId: v.id("users"),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("declined"),
    v.literal("maybe"),
  ),
  respondedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_invitee", ["inviteeId"])
  .index("by_invitee_and_status", ["inviteeId", "status"])
  .index("by_event_and_invitee", ["eventId", "inviteeId"]);

// Group chats. One row per group. `memberCount` is a denormalized counter
// kept in sync by the group-chat mutations so that listing queries don't need
// to scan `groupChatMembers` just to render a "N members" pill.
export const groupChats = defineTable({
  name: v.string(),
  avatarUrl: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  lastMessageAt: v.number(),
  lastPreview: v.optional(v.string()),
  memberCount: v.number(),
})
  .index("by_creator", ["createdBy", "createdAt"])
  .index("by_last_message", ["lastMessageAt"]);

// Group-chat membership roster. `role` is admin|member; at most 15 members
// per group is enforced in the mutations (not the schema). `addedBy` is the
// admin who added this member, or the creator for the seed membership.
export const groupChatMembers = defineTable({
  groupChatId: v.id("groupChats"),
  userId: v.id("users"),
  role: v.union(v.literal("admin"), v.literal("member")),
  addedAt: v.number(),
  addedBy: v.id("users"),
})
  .index("by_group", ["groupChatId"])
  .index("by_user", ["userId", "addedAt"])
  .index("by_group_and_user", ["groupChatId", "userId"]);

// Messages in a group chat.
//
// `author`:
//   "user"  — composed by the human at `from`.
//   "agent" — generated by the group's Homie agent and either auto-posted
//             (group-mode response) or shared (private response → share).
// `mentionsHomie`: true when the sender's composer text contains `@homie`
//   (or legacy `@agent`). Agent responses never set this flag.
// `format`: "plain" | "markdown" | "html" — mirrors directMessages.
// `forwardedFromMessageId` / `forwardedFromUserId`: when this message is a
//   forward of a DM, point back to the originating message and its original
//   sender so the UI can render an "Alice forwarded a message from Bob" pill.
// `readBy`: inline read-receipt list. Small per-group (<=15) so keeping this
//   on the row is cheap compared to a separate reads table.
export const groupChatMessages = defineTable({
  groupChatId: v.id("groupChats"),
  from: v.id("users"),
  author: v.union(v.literal("user"), v.literal("agent")),
  content: v.string(),
  format: v.union(
    v.literal("plain"),
    v.literal("markdown"),
    v.literal("html"),
  ),
  attachmentIds: v.optional(v.array(v.id("attachments"))),
  mentionsHomie: v.boolean(),
  forwardedFromMessageId: v.optional(v.id("directMessages")),
  forwardedFromUserId: v.optional(v.id("users")),
  sentAt: v.number(),
  readBy: v.array(
    v.object({ userId: v.id("users"), readAt: v.number() }),
  ),
})
  .index("by_group", ["groupChatId"])
  .index("by_group_and_sentAt", ["groupChatId", "sentAt"]);

// Private agent responses in a group chat.
//
// The asker tags `@homie` in the composer. If they picked "Private" reply
// mode the response stays private until they click Share (mirrors the DM
// flow). In "Group" mode the response is auto-posted as a groupChatMessages
// row with `author: "agent"` and `sharedAsMessageId` is set to that id.
//
// `skillUsed` tells the UI which extra rendering to layer on:
//   - findHangout / pickMovie — plain markdown body is enough.
//   - scheduleEvent — the composer parses the last 5 messages into a
//     potential event draft; `toolResults` is a JSON string the UI can
//     deserialize to render a rich card with the parsed date/time/place.
//   - general — fallback using the standard DM-agent prompt + tools.
export const groupChatAgentResponses = defineTable({
  groupChatId: v.id("groupChats"),
  askerId: v.id("users"),
  query: v.string(),
  content: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("ready"),
    v.literal("failed"),
  ),
  replyMode: v.union(v.literal("private"), v.literal("group")),
  skillUsed: v.optional(
    v.union(
      v.literal("findHangout"),
      v.literal("pickMovie"),
      v.literal("scheduleEvent"),
      v.literal("general"),
    ),
  ),
  toolResults: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  sharedAsMessageId: v.optional(v.id("groupChatMessages")),
})
  .index("by_group_and_asker", ["groupChatId", "askerId", "createdAt"]);

// Communities. Location-scoped interest groups (fitness, spiritual, hobby,
// academic, food, social). A community exposes an announcement feed, polls,
// and optionally its own events (see `events.communityId`). Membership is
// gated via `communityMembers`; join requests flow through
// `communityJoinRequests`. Public communities show up in `discoverCommunities`
// within their own radius + the viewer's radius (sum of the two). `isPaid`
// is a billing stub that mirrors businesses — dev mode flips it via
// `billing.devMarkPaid`.
//
// `geoBucket` is a server-computed "lat,lng" rounded to 0.1° so discovery
// can scan a 3x3 neighbour grid via the `by_geoBucket` index rather than
// full-scanning the table. 0.1° is ~11 km at the equator — good enough for
// the MVP radius tiers (neighbourhood, city, region).
export const communities = defineTable({
  name: v.string(),
  slug: v.string(),
  description: v.string(),
  category: v.union(
    v.literal("fitness"),
    v.literal("spiritual"),
    v.literal("hobby"),
    v.literal("academic"),
    v.literal("food"),
    v.literal("social"),
    v.literal("other"),
  ),
  coverImageUrl: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  locationLat: v.number(),
  locationLng: v.number(),
  locationLabel: v.optional(v.string()),
  locationRadiusKm: v.number(),
  // Full Places metadata captured when the creator picks a location from the
  // Places search dialog. All optional for backwards-compat with pre-existing
  // communities that were created with the manual lat/lng flow.
  locationPlaceId: v.optional(v.string()),
  locationMapsUri: v.optional(v.string()),
  locationAddress: v.optional(v.string()),
  locationCity: v.optional(v.string()),
  locationCountry: v.optional(v.string()),
  isPublic: v.boolean(),
  isPaid: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  memberCount: v.number(),
  geoBucket: v.string(),
})
  .index("by_slug", ["slug"])
  .index("by_category", ["category"])
  .index("by_geoBucket", ["geoBucket"])
  // Full-text search for the Discover "search by name or city" flow.
  .searchIndex("search_name", {
    searchField: "name",
    filterFields: ["isPublic", "category"],
  })
  .searchIndex("search_city", {
    searchField: "locationCity",
    filterFields: ["isPublic", "category"],
  });

// Community membership roster. Role hierarchy (lowest → highest):
//   member < announcer < moderator < admin
// Only admins see the full member list (privacy constraint from the spec).
// Announcers can post community announcements; moderators additionally
// create polls + pin announcements; admins handle join requests + role
// changes + removals.
export const communityMembers = defineTable({
  communityId: v.id("communities"),
  userId: v.id("users"),
  role: v.union(
    v.literal("admin"),
    v.literal("moderator"),
    v.literal("announcer"),
    v.literal("member"),
  ),
  joinedAt: v.number(),
  addedBy: v.optional(v.id("users")),
})
  .index("by_community", ["communityId"])
  .index("by_user", ["userId"])
  .index("by_community_and_user", ["communityId", "userId"])
  .index("by_community_and_role", ["communityId", "role"]);

// Pending / handled requests to join a community. One row per (community,
// user, request). On re-request after a previous decline we re-use the
// existing row — see `communityMembers.requestJoin`.
export const communityJoinRequests = defineTable({
  communityId: v.id("communities"),
  userId: v.id("users"),
  message: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("declined"),
  ),
  handledBy: v.optional(v.id("users")),
  createdAt: v.number(),
  handledAt: v.optional(v.number()),
})
  .index("by_community_and_status", ["communityId", "status"])
  .index("by_user", ["userId"])
  .index("by_community_and_user", ["communityId", "userId"]);

// Community announcements. Markdown body rendered via react-markdown +
// sanitize on the client. Pinned announcements are ordered first in the
// feed; otherwise we sort by `createdAt` descending.
export const communityAnnouncements = defineTable({
  communityId: v.id("communities"),
  authorId: v.id("users"),
  title: v.string(),
  body: v.string(),
  pinned: v.boolean(),
  createdAt: v.number(),
})
  .index("by_community_and_created", ["communityId", "createdAt"])
  .index("by_community_and_pinned", ["communityId", "pinned"]);

// Community polls. Options are stored as a bare string array — 2-8 options
// per poll is enforced in mutations. Votes live in `communityPollVotes`
// with a uniqueness guarantee of one vote per (poll, user).
export const communityPolls = defineTable({
  communityId: v.id("communities"),
  authorId: v.id("users"),
  question: v.string(),
  options: v.array(v.string()),
  closesAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_community_and_created", ["communityId", "createdAt"]);

export const communityPollVotes = defineTable({
  pollId: v.id("communityPolls"),
  userId: v.id("users"),
  optionIndex: v.number(),
  votedAt: v.number(),
})
  .index("by_poll", ["pollId"])
  .index("by_poll_and_user", ["pollId", "userId"]);

// Businesses. Represents a real-world organization (restaurant, retail,
// fitness studio, tech company, etc.) that can be followed by community
// members, run advertisements, and have an internal org chat. The
// `verified` and `isPaid` flags are stubs for a future billing flow —
// dev mode flips `isPaid` via `billing.devMarkPaid` to gate paid features.
//
// Contact + hours fields were added alongside `accountType: "business"` so a
// business account's /dashboard/profile (rendered via BusinessInfoForm) has
// a single source of truth for the outward-facing business details.
// Unbounded lists — branches and services — live in separate tables
// (`businessBranches`, `businessServices`) per schema guidelines.
export const businesses = defineTable({
  name: v.string(),
  slug: v.string(),
  tagline: v.optional(v.string()),
  description: v.optional(v.string()),
  category: v.union(
    v.literal("restaurant"),
    v.literal("retail"),
    v.literal("fitness"),
    v.literal("tech"),
    v.literal("service"),
    v.literal("other"),
  ),
  website: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  coverImageUrl: v.optional(v.string()),
  // Primary / HQ location. Additional locations live in `businessBranches`.
  locationAddress: v.optional(v.string()),
  locationLat: v.optional(v.number()),
  locationLng: v.optional(v.number()),
  // Public-facing contact. Distinct from the creator's personal email / phone
  // on `users`. Any of these may be empty — the UI renders only what's set.
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  contactWhatsapp: v.optional(v.string()),
  // Inline weekly hours. Bounded (at most 7 day rows) so it's safe to keep
  // on the parent doc. `closed: true` means the business doesn't operate on
  // that day; `open`/`close` are "HH:MM" 24h strings.
  hours: v.optional(
    v.array(
      v.object({
        day: v.union(
          v.literal("mon"),
          v.literal("tue"),
          v.literal("wed"),
          v.literal("thu"),
          v.literal("fri"),
          v.literal("sat"),
          v.literal("sun"),
        ),
        closed: v.boolean(),
        open: v.optional(v.string()),
        close: v.optional(v.string()),
      }),
    ),
  ),
  createdBy: v.id("users"),
  createdAt: v.number(),
  verified: v.boolean(),
  isPaid: v.boolean(),
})
  .index("by_slug", ["slug"])
  .index("by_creator", ["createdBy"])
  .index("by_category", ["category"]);

// Branch / additional storefront for a business. One row per physical
// location beyond the primary one on `businesses`. `displayOrder` lets the
// owner reorder them in the UI without changing creation times.
export const businessBranches = defineTable({
  businessId: v.id("businesses"),
  name: v.string(),
  address: v.optional(v.string()),
  locationLat: v.optional(v.number()),
  locationLng: v.optional(v.number()),
  mapsLink: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  displayOrder: v.number(),
  createdAt: v.number(),
})
  .index("by_business", ["businessId"])
  .index("by_business_and_order", ["businessId", "displayOrder"]);

// A single good or service offered by a business. Freeform price string so
// owners can express "From ₹499", "$50/hr", "Contact for quote", etc.
// without a structured money type. `displayOrder` for explicit ordering.
export const businessServices = defineTable({
  businessId: v.id("businesses"),
  name: v.string(),
  description: v.optional(v.string()),
  priceLabel: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  kind: v.union(v.literal("product"), v.literal("service")),
  displayOrder: v.number(),
  createdAt: v.number(),
})
  .index("by_business", ["businessId"])
  .index("by_business_and_order", ["businessId", "displayOrder"]);

// Business membership roster. Role hierarchy (lowest → highest):
//   employee < manager < admin < owner
// Managers can draft/submit ads. Admins can manage members + edit business
// metadata. The creator is seeded as `owner` and can never be removed.
export const businessMembers = defineTable({
  businessId: v.id("businesses"),
  userId: v.id("users"),
  role: v.union(
    v.literal("owner"),
    v.literal("admin"),
    v.literal("manager"),
    v.literal("employee"),
  ),
  addedAt: v.number(),
  addedBy: v.id("users"),
})
  .index("by_business", ["businessId"])
  .index("by_user", ["userId"])
  .index("by_business_and_user", ["businessId", "userId"])
  .index("by_business_and_role", ["businessId", "role"]);

// Internal channels under a business. MVP ships with a single auto-created
// "general" channel per business; the schema supports more channels so PR #7
// can introduce multiple rooms without a migration.
export const orgChannels = defineTable({
  businessId: v.id("businesses"),
  name: v.string(),
  createdAt: v.number(),
}).index("by_business", ["businessId"]);

// Explicit membership roster for org channels. Every business member with
// access to a channel has a row here; absence of a row means "not a member"
// which makes channel scoping easy to extend later (e.g. a private #finance
// channel that only admins see).
export const orgChannelMembers = defineTable({
  channelId: v.id("orgChannels"),
  userId: v.id("users"),
  joinedAt: v.number(),
})
  .index("by_channel", ["channelId"])
  .index("by_user", ["userId"])
  .index("by_channel_and_user", ["channelId", "userId"]);

// Messages inside an org channel. Simpler than groupChatMessages — there's
// no agent-response flow and no inline read receipts (channel chat MVP).
// `format` is restricted to text|markdown; rich HTML + attachments can land
// in a later PR without breaking existing rows.
export const orgChannelMessages = defineTable({
  channelId: v.id("orgChannels"),
  from: v.id("users"),
  content: v.string(),
  format: v.union(v.literal("text"), v.literal("markdown")),
  attachmentIds: v.optional(v.array(v.id("attachments"))),
  sentAt: v.number(),
}).index("by_channel_and_sentAt", ["channelId", "sentAt"]);

// Advertisements owned by a business. Status flow:
//   draft → submitted → approved → running → ended
//           └──────────→ rejected
// `caption` is capped at 2000 chars server-side. Budget + metrics are
// optional placeholders for PR #8 which wires tracking into communities.
export const ads = defineTable({
  advertiserBusinessId: v.id("businesses"),
  title: v.string(),
  subtitle: v.optional(v.string()),
  caption: v.string(),
  ctaLabel: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
  couponCode: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  status: v.union(
    v.literal("draft"),
    v.literal("submitted"),
    v.literal("approved"),
    v.literal("running"),
    v.literal("rejected"),
    v.literal("ended"),
  ),
  budgetPerWeek: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_advertiser", ["advertiserBusinessId"])
  .index("by_status", ["status"]);

// Per-ad daily metric buckets. Populated by PR #8's tracking handlers; the
// table lands here so analytics queries have a stable target from day one.
export const adMetrics = defineTable({
  adId: v.id("ads"),
  dateBucket: v.string(),
  impressions: v.number(),
  clicks: v.number(),
  couponSaves: v.number(),
  couponUses: v.number(),
})
  .index("by_ad", ["adId"])
  .index("by_ad_and_date", ["adId", "dateBucket"]);

// Weekly ad placement per community. Inserted by either:
//   - the free-tier auto-rotation cron (`placementType: "auto"`)
//   - a paid community admin picking an ad (`placementType: "admin_pick"`)
// `weekStart` is the Monday 00:00 UTC epoch ms for the placement week so a
// single index query can fetch "this week's placement for community X" in
// O(1). Computed via `_lib/time.currentMondayUTCms`.
export const communityAdPlacements = defineTable({
  communityId: v.id("communities"),
  adId: v.id("ads"),
  weekStart: v.number(),
  placementType: v.union(v.literal("auto"), v.literal("admin_pick")),
  selectedBy: v.optional(v.id("users")),
  createdAt: v.number(),
})
  .index("by_community_and_week", ["communityId", "weekStart"])
  .index("by_week", ["weekStart"]);

// Coupons saved by a viewer from a community ad surface. `usedAt` flips
// the row into the "used" state so the viewer can distinguish saved-but-
// pending coupons from ones they've already redeemed. Dedupe is enforced
// at the mutation layer via the `by_user_and_ad` index.
export const savedCoupons = defineTable({
  userId: v.id("users"),
  adId: v.id("ads"),
  couponCode: v.string(),
  savedAt: v.number(),
  usedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_user_and_ad", ["userId", "adId"]);

export default defineSchema({
  users,
  friends,
  messages,
  dmConversations,
  directMessages,
  attachments,
  agentChatResponses,
  conversations,
  conversationMessages,
  vapiCalls,
  spotifyAuth,
  spotifyConnections,
  spotifyUserTracks,
  spotifyNowPlaying,
  notifications,
  events,
  eventInvites,
  groupChats,
  groupChatMembers,
  groupChatMessages,
  groupChatAgentResponses,
  communities,
  communityMembers,
  communityJoinRequests,
  communityAnnouncements,
  communityPolls,
  communityPollVotes,
  businesses,
  businessBranches,
  businessServices,
  businessMembers,
  orgChannels,
  orgChannelMembers,
  orgChannelMessages,
  ads,
  adMetrics,
  communityAdPlacements,
  savedCoupons,
});
