import { v } from "convex/values"
import {
  query,
  mutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import {
  getCallerUserId,
  requireCommunityRole,
  type CommunityRole,
} from "./_lib/authz"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId })
  return await getCallerUserId(ctx, { email: identity.email })
}

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers"> | null> {
  return await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_user", (q) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .unique()
}

// Internal-facing check used by a few queries that want "member or throw"
// without importing the full role-rank machinery.
async function requireMember(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers">> {
  const m = await getMembership(ctx, communityId, userId)
  if (!m) throw new Error("Not a community member")
  return m
}

const ASSIGNABLE_ROLE_VALIDATOR = v.union(
  v.literal("admin"),
  v.literal("moderator"),
  v.literal("announcer"),
  v.literal("member"),
)

// Notify every admin of a community with the given notification args.
// Used on join requests. `meta.requestId` + `communityId` power the
// admin-side click-through.
async function notifyAdmins(
  ctx: MutationCtx,
  communityId: Id<"communities">,
  notificationArgs: {
    type:
      | "community_join_request"
      | "community_announcement"
      | "community_request_accepted"
      | "community_request_declined"
      | "community_role_changed"
      | "community_removed"
    title: string
    body?: string
    link?: string
    meta?: Record<string, unknown>
  },
): Promise<void> {
  const admins = await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_role", (q) =>
      q.eq("communityId", communityId).eq("role", "admin"),
    )
    .collect()
  for (const a of admins) {
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: a.userId,
        ...notificationArgs,
      },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Request to join a community. If the caller is already a member this is
// a no-op (we return the existing membership id). If the caller was
// previously declined we re-open the request row by flipping status back
// to `pending` — lets a user re-apply after a policy change without
// scattering declined rows.
export const requestJoin = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")

    const membership = await getMembership(ctx, args.communityId, callerId)
    if (membership) {
      // Already a member — nothing to do.
      return { requestId: null, alreadyMember: true }
    }

    const existing = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_and_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", callerId),
      )
      .unique()

    const now = Date.now()
    let requestId: Id<"communityJoinRequests">
    if (existing) {
      if (existing.status === "pending") {
        // Already pending — no new notification.
        return { requestId: existing._id, alreadyMember: false }
      }
      // accepted: can't reach here because the caller is already a member
      // (we checked above). declined: re-open.
      await ctx.db.patch(existing._id, {
        status: "pending",
        message: args.message,
        createdAt: now,
        handledBy: undefined,
        handledAt: undefined,
      })
      requestId = existing._id
    } else {
      requestId = await ctx.db.insert("communityJoinRequests", {
        communityId: args.communityId,
        userId: callerId,
        message: args.message,
        status: "pending",
        createdAt: now,
      })
    }

    const requester = await ctx.db.get(callerId)
    const requesterName = requester?.name ?? "Someone"
    await notifyAdmins(ctx, args.communityId, {
      type: "community_join_request",
      title: `${requesterName} asked to join ${community.name}`,
      body: args.message ?? undefined,
      link: `/dashboard/communities/${community.slug}/manage`,
      meta: {
        communityId: args.communityId,
        requestId,
        requesterId: callerId,
      },
    })

    return { requestId, alreadyMember: false }
  },
})

// Accept a pending join request. Admin-only. Creates the member row,
// bumps `memberCount`, and marks the request as accepted. Notifies the
// requester so they see the community appear in their list.
export const acceptJoinRequest = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const request = await ctx.db.get(args.requestId)
    if (!request) throw new Error("Request not found")
    await requireCommunityRole(ctx, callerId, request.communityId, "admin")

    const community = await ctx.db.get(request.communityId)
    if (!community) throw new Error("Community not found")

    if (request.status !== "pending") {
      throw new Error("Request is not pending")
    }

    const now = Date.now()

    // Dedupe: if the target somehow is already a member we still mark
    // the request accepted without a second insert.
    const existing = await getMembership(
      ctx,
      request.communityId,
      request.userId,
    )
    if (!existing) {
      await ctx.db.insert("communityMembers", {
        communityId: request.communityId,
        userId: request.userId,
        role: "member",
        joinedAt: now,
        addedBy: callerId,
      })
      await ctx.db.patch(request.communityId, {
        memberCount: community.memberCount + 1,
      })
    }

    await ctx.db.patch(args.requestId, {
      status: "accepted",
      handledBy: callerId,
      handledAt: now,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: request.userId,
        type: "community_request_accepted",
        title: `You're in: ${community.name}`,
        body: "Your request to join was accepted.",
        link: `/dashboard/communities/${community.slug}`,
        meta: { communityId: request.communityId },
      },
    )
  },
})

// Decline a pending join request. Admin-only. Notifies the requester so
// they know not to keep checking.
export const declineJoinRequest = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const request = await ctx.db.get(args.requestId)
    if (!request) throw new Error("Request not found")
    await requireCommunityRole(ctx, callerId, request.communityId, "admin")

    const community = await ctx.db.get(request.communityId)
    if (!community) throw new Error("Community not found")

    if (request.status !== "pending") {
      throw new Error("Request is not pending")
    }

    const now = Date.now()
    await ctx.db.patch(args.requestId, {
      status: "declined",
      handledBy: callerId,
      handledAt: now,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: request.userId,
        type: "community_request_declined",
        title: `Request declined: ${community.name}`,
        body: "You can request to join again later.",
        meta: { communityId: request.communityId },
      },
    )
  },
})

// Remove a member from a community. Admin-only. Guards against removing
// the last admin (would leave the community un-manageable) and notifies
// the removed user.
export const removeMember = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const target = await getMembership(
      ctx,
      args.communityId,
      args.targetUserId,
    )
    if (!target) throw new Error("User is not a member")

    if (target.role === "admin") {
      // Block removal when this is the only remaining admin.
      const admins = await ctx.db
        .query("communityMembers")
        .withIndex("by_community_and_role", (q) =>
          q.eq("communityId", args.communityId).eq("role", "admin"),
        )
        .collect()
      if (admins.length <= 1) {
        throw new Error("Cannot remove the last admin")
      }
    }

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")

    await ctx.db.delete(target._id)
    await ctx.db.patch(args.communityId, {
      memberCount: Math.max(0, community.memberCount - 1),
    })

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.targetUserId,
        type: "community_removed",
        title: `You were removed from ${community.name}`,
        body: "You no longer have access to this community.",
        link: `/dashboard/communities`,
        meta: { communityId: args.communityId },
      },
    )
  },
})

// Change a member's role. Admin-only. Cannot demote the last admin so
// the community never ends up orphaned. Notifies the target with
// `community_role_changed`.
export const updateMemberRole = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    newRole: ASSIGNABLE_ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const target = await getMembership(
      ctx,
      args.communityId,
      args.targetUserId,
    )
    if (!target) throw new Error("User is not a member")
    if (target.role === args.newRole) return

    if (target.role === "admin" && args.newRole !== "admin") {
      const admins = await ctx.db
        .query("communityMembers")
        .withIndex("by_community_and_role", (q) =>
          q.eq("communityId", args.communityId).eq("role", "admin"),
        )
        .collect()
      if (admins.length <= 1) {
        throw new Error("Cannot demote the last admin")
      }
    }

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")

    await ctx.db.patch(target._id, { role: args.newRole })

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.targetUserId,
        type: "community_role_changed",
        title: `Your role at ${community.name} changed`,
        body: `New role: ${args.newRole}`,
        link: `/dashboard/communities/${community.slug}`,
        meta: { communityId: args.communityId, role: args.newRole },
      },
    )
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// List every member with their enriched user doc. Admin-only by product
// decision: the spec says "Only admin can see who you are; members
// cannot see others." Members hitting this query get an error so the UI
// can route them to a "Not allowed" state.
export const listMembers = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_community", (q) =>
        q.eq("communityId", args.communityId),
      )
      .collect()

    const enriched = await Promise.all(
      rows.map(async (m) => ({
        membership: m,
        user: await ctx.db.get(m.userId),
      })),
    )
    enriched.sort((a, b) => a.membership.joinedAt - b.membership.joinedAt)
    return {
      members: enriched,
      myRole: "admin" as CommunityRole,
      myUserId: callerId,
    }
  },
})

// List pending join requests for a community. Admin-only. Used by the
// Manage page's Requests tab.
export const listPendingRequests = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const rows = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_and_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "pending"),
      )
      .collect()

    const enriched = await Promise.all(
      rows.map(async (r) => ({
        request: r,
        user: await ctx.db.get(r.userId),
      })),
    )
    enriched.sort((a, b) => a.request.createdAt - b.request.createdAt)
    return enriched
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

// Shared membership probe used by cross-file callers (announcements,
// polls, event listings). Avoids re-implementing the index lookup in
// each module.
export const isMemberInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getMembership(ctx, args.communityId, args.userId)
  },
})

// Exposed so future test/fixture code can flip a role without going
// through the admin mutation. Internal-only.
export const _requireMemberInternal = requireMember
