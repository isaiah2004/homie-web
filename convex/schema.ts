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

// User profiles table
export const users = defineTable({
  name: v.string(),
  email: v.string(),
  // Mirror of Clerk's username. Optional because a Clerk user may not have one
  // set yet; only users with a username are discoverable via search.
  username: v.optional(v.string()),
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
    tags: v.array(v.string()),
    visibility: visibilityEnum,
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
// `mentionsAgent`: true when the sender's original composer contained `@agent`.
//   Used only for the pill render on the sender's side; a mention never routes
//   the message to the recipient by itself — mentions trigger a private
//   agent response (see agentChatResponses) that the user can choose to share.
export const directMessages = defineTable({
  conversationId: v.id("dmConversations"),
  from: v.id("users"),
  to: v.id("users"),
  content: v.string(),
  author: v.union(v.literal("user"), v.literal("agent")),
  mentionsAgent: v.boolean(),
  sentAt: v.number(),
  readAt: v.optional(v.number()),
})
  .index("by_conversation", ["conversationId", "sentAt"])
  .index("by_to_and_read", ["to", "readAt"]);

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

export default defineSchema({
  users,
  friends,
  messages,
  dmConversations,
  directMessages,
  agentChatResponses,
  conversations,
  conversationMessages,
  vapiCalls,
  spotifyAuth,
});
