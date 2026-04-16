import {
  query,
  mutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — not exported as Convex functions.
// ─────────────────────────────────────────────────────────────────────────────

async function getEdge(
  ctx: QueryCtx,
  userId: Id<"users">,
  friendId: Id<"users">,
): Promise<Doc<"friends"> | null> {
  return await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", userId).eq("friendId", friendId),
    )
    .unique();
}

async function getAcceptedFriendIds(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"users">[]> {
  const rows = await ctx.db
    .query("friends")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "accepted"),
    )
    .collect();
  return rows.map((r) => r.friendId);
}

async function countMutualsBetween(
  ctx: QueryCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<number> {
  const aFriends = new Set(await getAcceptedFriendIds(ctx, a));
  const bFriends = await getAcceptedFriendIds(ctx, b);
  let count = 0;
  for (const id of bFriends) {
    if (id !== a && id !== b && aFriends.has(id)) count++;
  }
  return count;
}

async function enrich(
  ctx: QueryCtx,
  edges: Doc<"friends">[],
): Promise<Array<{ edge: Doc<"friends">; friend: Doc<"users"> | null }>> {
  const users = await Promise.all(edges.map((e) => ctx.db.get(e.friendId)));
  return edges.map((edge, i) => ({ edge, friend: users[i] }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export const listFriends = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const edges = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "accepted"),
      )
      .collect();
    return await enrich(ctx, edges);
  },
});

export const listCloseFriends = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const edges = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "accepted"),
      )
      .collect();
    const close = edges.filter((e) => e.tier === "close");
    return await enrich(ctx, close);
  },
});

export const listIncomingRequests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const edges = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .collect();
    const incoming = edges.filter((e) => e.requestedBy !== userId);
    return await enrich(ctx, incoming);
  },
});

export const listOutgoingRequests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const edges = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .collect();
    const outgoing = edges.filter((e) => e.requestedBy === userId);
    return await enrich(ctx, outgoing);
  },
});

// Relationship state from `viewerId`'s perspective toward `otherUserId`.
// Returns one of: "self" | "close" | "friend" | "pendingOutgoing"
//               | "pendingIncoming" | "mutual" | "none"
export const getRelationship = query({
  args: {
    viewerId: v.id("users"),
    otherUserId: v.id("users"),
  },
  handler: async (ctx, { viewerId, otherUserId }) => {
    if (viewerId === otherUserId) return "self" as const;
    const edge = await getEdge(ctx, viewerId, otherUserId);
    if (edge) {
      if (edge.status === "pending") {
        return edge.requestedBy === viewerId
          ? ("pendingOutgoing" as const)
          : ("pendingIncoming" as const);
      }
      return edge.tier === "close" ? ("close" as const) : ("friend" as const);
    }
    const mutuals = await countMutualsBetween(ctx, viewerId, otherUserId);
    return mutuals > 0 ? ("mutual" as const) : ("none" as const);
  },
});

// Count of friends shared between two users (the "12 mutual friends" label).
export const countMutualFriends = query({
  args: {
    userAId: v.id("users"),
    userBId: v.id("users"),
  },
  handler: async (ctx, { userAId, userBId }) => {
    if (userAId === userBId) return 0;
    return await countMutualsBetween(ctx, userAId, userBId);
  },
});

// Visibility gate for profile fields tagged with `close | friends | mutual | none`.
// `ownerId` owns the content; `viewerId` is trying to read it.
export const canView = query({
  args: {
    viewerId: v.id("users"),
    ownerId: v.id("users"),
    tag: v.union(
      v.literal("close"),
      v.literal("friends"),
      v.literal("mutual"),
      v.literal("none"),
    ),
  },
  handler: async (ctx, { viewerId, ownerId, tag }) => {
    if (viewerId === ownerId) return true;
    if (tag === "none") return false;
    const edge = await getEdge(ctx, ownerId, viewerId);
    const isAcceptedFriend = edge?.status === "accepted";
    if (tag === "friends") return isAcceptedFriend;
    if (tag === "close") return isAcceptedFriend && edge.tier === "close";
    if (isAcceptedFriend) return true;
    return (await countMutualsBetween(ctx, viewerId, ownerId)) > 0;
  },
});

// Used by the Homie agent's RAG tools to scope embedding searches to the
// asker's social graph, with tier info so close-only queries can filter.
export const getFriendIdsWithTier = internalQuery({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    { userId },
  ): Promise<Array<{ id: Id<"users">; tier: "close" | "friend" }>> => {
    const rows = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "accepted"),
      )
      .collect();
    return rows.map((r) => ({ id: r.friendId, tier: r.tier }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

async function deletePair(
  ctx: MutationCtx,
  userId: Id<"users">,
  friendId: Id<"users">,
) {
  const mine = await getEdge(ctx, userId, friendId);
  const theirs = await getEdge(ctx, friendId, userId);
  if (mine) await ctx.db.delete(mine._id);
  if (theirs) await ctx.db.delete(theirs._id);
}

export const sendFriendRequest = mutation({
  args: {
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
  },
  handler: async (ctx, { fromUserId, toUserId }) => {
    if (fromUserId === toUserId) {
      throw new Error("Cannot send a friend request to yourself");
    }

    const existing = await getEdge(ctx, fromUserId, toUserId);
    if (existing?.status === "accepted") {
      throw new Error("Already friends");
    }
    if (existing?.status === "pending") {
      if (existing.requestedBy === fromUserId) {
        throw new Error("Friend request already sent");
      }
      // They requested me first → treat this as acceptance.
      const theirs = await getEdge(ctx, toUserId, fromUserId);
      await ctx.db.patch(existing._id, { status: "accepted" });
      if (theirs) await ctx.db.patch(theirs._id, { status: "accepted" });
      return { status: "accepted" as const };
    }

    const now = Date.now();
    await ctx.db.insert("friends", {
      userId: fromUserId,
      friendId: toUserId,
      status: "pending",
      tier: "friend",
      requestedBy: fromUserId,
      addedAt: now,
    });
    await ctx.db.insert("friends", {
      userId: toUserId,
      friendId: fromUserId,
      status: "pending",
      tier: "friend",
      requestedBy: fromUserId,
      addedAt: now,
    });
    return { status: "pending" as const };
  },
});

export const acceptFriendRequest = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    const mine = await getEdge(ctx, userId, friendId);
    const theirs = await getEdge(ctx, friendId, userId);
    if (!mine || !theirs) throw new Error("No friend request found");
    if (mine.status !== "pending") throw new Error("Request is not pending");
    if (mine.requestedBy === userId) {
      throw new Error("Cannot accept your own outgoing request");
    }
    await ctx.db.patch(mine._id, { status: "accepted" });
    await ctx.db.patch(theirs._id, { status: "accepted" });
  },
});

// Recipient declines an incoming request.
export const declineFriendRequest = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    await deletePair(ctx, userId, friendId);
  },
});

// Sender cancels an outgoing request they sent.
export const cancelFriendRequest = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    await deletePair(ctx, userId, friendId);
  },
});

// Unfriend (tears down an accepted friendship, either direction).
export const removeFriend = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    await deletePair(ctx, userId, friendId);
  },
});

// Owner-side tier toggle. Only updates `userId`'s row — NOT the mirror.
// Asymmetric by design.
export const setCloseFriend = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
    isClose: v.boolean(),
  },
  handler: async (ctx, { userId, friendId, isClose }) => {
    const mine = await getEdge(ctx, userId, friendId);
    if (!mine) throw new Error("Not a friend");
    if (mine.status !== "accepted") {
      throw new Error("Cannot tier a pending friendship");
    }
    await ctx.db.patch(mine._id, { tier: isClose ? "close" : "friend" });
  },
});
