import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveViewerId(
  ctx: QueryCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique();
  if (!user) throw new Error("User not found for identity");
  return user._id;
}

async function getMembership(
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
): Promise<Doc<"eventRoomMembers"> | null> {
  return await ctx.db
    .query("eventRoomMembers")
    .withIndex("by_event_and_user", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .unique();
}

async function assertMembership(
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
): Promise<Doc<"eventRoomMembers">> {
  const m = await getMembership(ctx, eventId, userId);
  if (!m) throw new Error("You are not a member of this lobby");
  return m;
}

// 16-char base32 (Crockford-flavored, no padding) — collision odds for
// reasonable invite volumes are negligible. Using `crypto.getRandomValues`
// works in both the V8 default runtime and Node.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += BASE32[bytes[i] % 32];
  }
  return out;
}

async function relationship(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  otherUserId: Id<"users">,
): Promise<
  "self" | "close" | "friend" | "pendingOutgoing" | "pendingIncoming" | "none"
> {
  if (viewerId === otherUserId) return "self";
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", viewerId).eq("friendId", otherUserId),
    )
    .unique();
  if (!edge) return "none";
  if (edge.status === "pending") {
    return edge.requestedBy === viewerId ? "pendingOutgoing" : "pendingIncoming";
  }
  return edge.tier === "close" ? "close" : "friend";
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export const generateShareLink = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.createdBy !== viewerId) {
      throw new Error("Only the creator can generate a share link");
    }
    if (event.shareToken) return { shareToken: event.shareToken };

    // Tiny retry loop in case of (extremely unlikely) collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = generateToken();
      const existing = await ctx.db
        .query("events")
        .withIndex("by_shareToken", (q) => q.eq("shareToken", token))
        .unique();
      if (existing) continue;
      await ctx.db.patch(args.eventId, { shareToken: token });
      return { shareToken: token };
    }
    throw new Error("Could not generate a unique share token, please retry");
  },
});

export const revokeShareLink = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.createdBy !== viewerId) {
      throw new Error("Only the creator can revoke the share link");
    }
    if (!event.shareToken) return;
    await ctx.db.patch(args.eventId, { shareToken: undefined });
  },
});

export const joinEventRoom = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const token = args.shareToken.trim();
    if (!token) throw new Error("Invalid invite link");
    const event = await ctx.db
      .query("events")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", token))
      .unique();
    if (!event) throw new Error("Invalid invite link");
    if (event.roomEnabled === false) {
      throw new Error("This lobby is closed");
    }

    const existing = await getMembership(ctx, event._id, viewerId);
    if (existing) {
      return { eventId: event._id, alreadyMember: true };
    }

    const now = Date.now();
    await ctx.db.insert("eventRoomMembers", {
      eventId: event._id,
      userId: viewerId,
      role: "member",
      joinedAt: now,
      lastReadAt: now,
    });
    await ctx.db.patch(event._id, {
      roomMemberCount: (event.roomMemberCount ?? 0) + 1,
    });

    // Rate-limit host notification: skip if any event_room_join was emitted
    // for this event in the last 60s. Index is keyed on createdAt so we
    // bound the scan there.
    const sixtySecondsAgo = now - 60_000;
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_createdAt", (q) =>
        q.eq("userId", event.createdBy).gte("createdAt", sixtySecondsAgo),
      )
      .take(20);
    const alreadyNotifiedRecently = recent.some(
      (n) =>
        n.type === "event_room_join" &&
        (n.meta as { eventId?: string } | undefined)?.eventId === event._id,
    );
    if (!alreadyNotifiedRecently) {
      const joiner = await ctx.db.get(viewerId);
      const joinerName = joiner?.name ?? "Someone";
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId: event.createdBy,
          type: "event_room_join",
          title: `${joinerName} joined the lobby for ${event.name}`,
          body: undefined,
          link: `/dashboard/events/${event._id}/lobby`,
          meta: { eventId: event._id },
        },
      );
    }

    return { eventId: event._id, alreadyMember: false };
  },
});

export const leaveEventRoom = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const membership = await getMembership(ctx, args.eventId, viewerId);
    if (!membership) return;
    if (membership.role === "host") {
      throw new Error("The host can't leave the lobby");
    }
    await ctx.db.delete(membership._id);
    const event = await ctx.db.get(args.eventId);
    if (event) {
      await ctx.db.patch(args.eventId, {
        roomMemberCount: Math.max(0, (event.roomMemberCount ?? 1) - 1),
      });
    }
  },
});

export const markRoomRead = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const membership = await assertMembership(ctx, args.eventId, viewerId);
    await ctx.db.patch(membership._id, { lastReadAt: Date.now() });
  },
});

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export const sendRoomMessage = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    content: v.string(),
    format: v.union(
      v.literal("plain"),
      v.literal("markdown"),
      v.literal("html"),
    ),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    plainText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.eventId, viewerId);

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.roomEnabled === false) {
      throw new Error("This lobby is closed");
    }

    const rawContent = args.content ?? "";
    const normalizedContent =
      args.format === "html" ? rawContent : rawContent.trim();

    const hasBody =
      args.format === "html"
        ? (args.plainText?.trim().length ?? 0) > 0 ||
          stripHtmlTags(normalizedContent).length > 0
        : normalizedContent.length > 0;
    const hasAttachments = (args.attachmentIds?.length ?? 0) > 0;
    if (!hasBody && !hasAttachments) {
      throw new Error("Message cannot be empty");
    }

    if (args.attachmentIds && args.attachmentIds.length > 0) {
      for (const aid of args.attachmentIds) {
        const attachment = await ctx.db.get(aid);
        if (!attachment) throw new Error("Attachment not found");
        if (attachment.userId !== viewerId) {
          throw new Error("Cannot attach someone else's file");
        }
      }
    }

    const messageId = await ctx.db.insert("eventRoomMessages", {
      eventId: args.eventId,
      from: viewerId,
      content: normalizedContent,
      format: args.format,
      attachmentIds: args.attachmentIds,
      sentAt: Date.now(),
    });
    return messageId;
  },
});

export const addFriendFromRoom = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    if (viewerId === args.targetUserId) {
      throw new Error("Cannot send a friend request to yourself");
    }
    await assertMembership(ctx, args.eventId, viewerId);
    const targetMembership = await getMembership(
      ctx,
      args.eventId,
      args.targetUserId,
    );
    if (!targetMembership) {
      throw new Error("That user isn't in this lobby");
    }

    const existing = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", viewerId).eq("friendId", args.targetUserId),
      )
      .unique();
    if (existing?.status === "accepted") {
      throw new Error("Already friends");
    }
    if (existing?.status === "pending") {
      if (existing.requestedBy === viewerId) {
        throw new Error("Friend request already sent");
      }
      const theirs = await ctx.db
        .query("friends")
        .withIndex("by_user_and_friend", (q) =>
          q.eq("userId", args.targetUserId).eq("friendId", viewerId),
        )
        .unique();
      await ctx.db.patch(existing._id, { status: "accepted" });
      if (theirs) await ctx.db.patch(theirs._id, { status: "accepted" });
      return { status: "accepted" as const };
    }

    const now = Date.now();
    await ctx.db.insert("friends", {
      userId: viewerId,
      friendId: args.targetUserId,
      status: "pending",
      tier: "friend",
      requestedBy: viewerId,
      addedAt: now,
    });
    await ctx.db.insert("friends", {
      userId: args.targetUserId,
      friendId: viewerId,
      status: "pending",
      tier: "friend",
      requestedBy: viewerId,
      addedAt: now,
    });
    return { status: "pending" as const };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export const getRoomForViewer = query({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const membership = await getMembership(ctx, args.eventId, viewerId);
    const isMember = membership !== null;
    const isHost = membership?.role === "host" || event.createdBy === viewerId;

    let communityInfo:
      | {
          communityId: Id<"communities">;
          communityName: string;
          communitySlug: string;
          isViewerMember: boolean;
        }
      | null = null;
    if (event.communityId) {
      const community = await ctx.db.get(event.communityId);
      if (community) {
        const cm = await ctx.db
          .query("communityMembers")
          .withIndex("by_community_and_user", (q) =>
            q
              .eq("communityId", event.communityId!)
              .eq("userId", viewerId),
          )
          .unique();
        communityInfo = {
          communityId: community._id,
          communityName: community.name,
          communitySlug: community.slug,
          isViewerMember: cm !== null,
        };
      }
    }

    return {
      event,
      isMember,
      isHost,
      memberCount: event.roomMemberCount ?? 0,
      myLastReadAt: membership?.lastReadAt ?? null,
      roomEnabled: event.roomEnabled !== false,
      communityInfo,
    };
  },
});

export const listRoomMembers = query({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.eventId, viewerId);

    const result = await ctx.db
      .query("eventRoomMembers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("asc")
      .paginate(args.paginationOpts);

    const enriched = await Promise.all(
      result.page.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        const rel = await relationship(ctx, viewerId, row.userId);
        return {
          membership: row,
          user: user
            ? {
                _id: user._id,
                name: user.name,
                username: user.username ?? null,
                avatar: user.avatar ?? null,
                location: user.location ?? null,
              }
            : null,
          relationship: rel,
        };
      }),
    );

    return { ...result, page: enriched };
  },
});

export const listRoomMessages = query({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await assertMembership(ctx, args.eventId, viewerId);

    const result = await ctx.db
      .query("eventRoomMessages")
      .withIndex("by_event_and_sentAt", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);

    // Enrich each message with the sender's display info so the UI can
    // render names/avatars without a second round-trip per row.
    const senderIds = Array.from(
      new Set(result.page.map((m) => m.from as string)),
    );
    const senderMap = new Map<
      string,
      { _id: Id<"users">; name: string; username: string | null; avatar: string | null }
    >();
    for (const id of senderIds) {
      const user = await ctx.db.get(id as Id<"users">);
      if (user) {
        senderMap.set(id, {
          _id: user._id,
          name: user.name,
          username: user.username ?? null,
          avatar: user.avatar ?? null,
        });
      }
    }
    return {
      ...result,
      page: result.page.map((m) => ({
        message: m,
        sender: senderMap.get(m.from as string) ?? null,
      })),
    };
  },
});

export const getMatchState = query({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const state = await ctx.db
      .query("eventMatchState")
      .withIndex("by_event_and_viewer", (q) =>
        q.eq("eventId", args.eventId).eq("viewerId", viewerId),
      )
      .unique();
    if (!state) return null;
    return {
      matches: state.currentMatches,
      rerollCount: state.rerollCount,
      rerollsRemaining: Math.max(0, 3 - state.rerollCount),
      lastComputedAt: state.lastComputedAt,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal — consumed by convex/eventMatch.ts (action runtime).
// ─────────────────────────────────────────────────────────────────────────────

export const internalAssertMembership = internalQuery({
  args: { eventId: v.id("events"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const m = await getMembership(ctx, args.eventId, args.userId);
    return m !== null;
  },
});

export const internalListMemberIds = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("eventRoomMembers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return rows.map((r) => r.userId);
  },
});

export const internalGetMatchState = internalQuery({
  args: { eventId: v.id("events"), viewerId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventMatchState")
      .withIndex("by_event_and_viewer", (q) =>
        q.eq("eventId", args.eventId).eq("viewerId", args.viewerId),
      )
      .unique();
  },
});

export const internalSetMatchState = internalMutation({
  args: {
    eventId: v.id("events"),
    viewerId: v.id("users"),
    rerollCount: v.number(),
    shownUserIds: v.array(v.id("users")),
    currentMatches: v.array(
      v.object({
        userId: v.id("users"),
        score: v.number(),
        reasons: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("eventMatchState")
      .withIndex("by_event_and_viewer", (q) =>
        q.eq("eventId", args.eventId).eq("viewerId", args.viewerId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        rerollCount: args.rerollCount,
        shownUserIds: args.shownUserIds,
        currentMatches: args.currentMatches,
        lastComputedAt: now,
      });
    } else {
      await ctx.db.insert("eventMatchState", {
        eventId: args.eventId,
        viewerId: args.viewerId,
        rerollCount: args.rerollCount,
        shownUserIds: args.shownUserIds,
        currentMatches: args.currentMatches,
        lastComputedAt: now,
      });
    }
  },
});

// Resolves the action caller's viewer id. Lives here so the "use node"
// eventMatch.ts file doesn't have to do its own users lookup (queries
// can't run inside a Node action runtime).
export const internalResolveViewerForAction = internalQuery({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) throw new Error("User not found for identity");
    return user._id;
  },
});

// Internal getters used by the eventMatch action for scoring inputs.
// Pulling everything in once per compute keeps the action's transaction
// surface small.
export const internalGetUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const internalGetAcceptedFriendIds = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "accepted"),
      )
      .collect();
    return rows.map((r) => r.friendId);
  },
});

// Used by the mutual-friends sub-score so the action stays in one runtime.
export const internalCountMutuals = internalQuery({
  args: { userAId: v.id("users"), userBId: v.id("users") },
  handler: async (ctx, args) => {
    if (args.userAId === args.userBId) return 0;
    const aRows = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userAId).eq("status", "accepted"),
      )
      .collect();
    const bRows = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userBId).eq("status", "accepted"),
      )
      .collect();
    const aSet = new Set(aRows.map((r) => r.friendId as string));
    let count = 0;
    for (const r of bRows) {
      if (aSet.has(r.friendId as string)) count++;
    }
    return count;
  },
});

// Wrapper kept for symmetry — used in tests and to satisfy lint about unused
// imports.
export type _MutationCtxRef = MutationCtx;
