import { v } from "convex/values"
import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import { getCallerUserId, requireCommunityRole } from "./_lib/authz"

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

async function getPendingInviteForPair(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityInvites"> | null> {
  const rows = await ctx.db
    .query("communityInvites")
    .withIndex("by_community_and_user", (q) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .collect()
  return rows.find((r) => r.status === "pending") ?? null
}

// Shared path used by both the single-user and bulk invite mutations.
// Assumes the caller has already been authorized as admin. Returns a small
// status discriminator so the batch mutations can aggregate counts. Never
// throws for the already-member / already-invited cases — those are
// expected and reported in the return shape.
async function inviteOneAsAdmin(
  ctx: MutationCtx,
  args: {
    communityId: Id<"communities">
    community: Doc<"communities">
    targetUserId: Id<"users">
    adminId: Id<"users">
    adminName: string
  },
): Promise<
  | { status: "created"; inviteId: Id<"communityInvites"> }
  | { status: "alreadyMember" }
  | { status: "alreadyInvited"; inviteId: Id<"communityInvites"> }
  | { status: "self" }
> {
  if (args.targetUserId === args.adminId) {
    return { status: "self" }
  }
  const membership = await getMembership(
    ctx,
    args.communityId,
    args.targetUserId,
  )
  if (membership) return { status: "alreadyMember" }

  const existing = await getPendingInviteForPair(
    ctx,
    args.communityId,
    args.targetUserId,
  )
  if (existing) return { status: "alreadyInvited", inviteId: existing._id }

  const now = Date.now()
  const inviteId = await ctx.db.insert("communityInvites", {
    communityId: args.communityId,
    userId: args.targetUserId,
    invitedBy: args.adminId,
    status: "pending",
    createdAt: now,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.notifications.createNotification,
    {
      userId: args.targetUserId,
      type: "community_invite",
      title: `${args.adminName} invited you to ${args.community.name}`,
      body: args.community.description,
      link: `/dashboard/communities?tab=invites`,
      meta: {
        inviteId,
        communityId: args.communityId,
        communityName: args.community.name,
        invitedByName: args.adminName,
      },
    },
  )
  return { status: "created", inviteId }
}

// Dedupe + normalize a list of free-text entries. Splits on commas, spaces,
// and newlines; trims + lowercases; strips any leading `@`; drops empties.
// Caps at `limit` to bound work per call.
function parseBulkList(input: string[], limit: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const parts = raw
      .split(/[\s,]+/)
      .map((p) => p.trim().toLowerCase().replace(/^@+/, ""))
      .filter(Boolean)
    for (const p of parts) {
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
      if (out.length >= limit) return out
    }
  }
  return out
}

const MAX_BULK = 200

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Invite a single user by id. Admin-only. Idempotent on an existing pending
// invite (returns `{ alreadyInvited: true }`). No-op when the target is
// already a member (`{ alreadyMember: true }`).
export const inviteUser = mutation({
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

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")
    const admin = await ctx.db.get(callerId)
    const adminName = admin?.name ?? "Someone"

    const result = await inviteOneAsAdmin(ctx, {
      communityId: args.communityId,
      community,
      targetUserId: args.targetUserId,
      adminId: callerId,
      adminName,
    })

    switch (result.status) {
      case "alreadyMember":
        return { alreadyMember: true as const }
      case "alreadyInvited":
        return {
          alreadyInvited: true as const,
          inviteId: result.inviteId,
        }
      case "self":
        return { alreadyMember: true as const }
      case "created":
        return { invited: true as const, inviteId: result.inviteId }
    }
  },
})

// Resolve a bulk list to its three buckets without writing anything. Admin-
// only. Drives the confirmation step in the Bulk add dialog.
export const resolveInviteList = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    kind: v.union(v.literal("email"), v.literal("username")),
    entries: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const list = parseBulkList(args.entries, MAX_BULK)

    const matches: Array<{
      entry: string
      userId: Id<"users">
      name: string
      username: string | null
      email: string
    }> = []
    const alreadyMembers: string[] = []
    const alreadyInvited: string[] = []
    const misses: string[] = []

    for (const entry of list) {
      let user: Doc<"users"> | null = null
      if (args.kind === "email") {
        user = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", entry))
          .unique()
      } else {
        user = await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", entry))
          .unique()
      }
      if (!user) {
        misses.push(entry)
        continue
      }
      const membership = await getMembership(
        ctx,
        args.communityId,
        user._id,
      )
      if (membership) {
        alreadyMembers.push(entry)
        continue
      }
      const pending = await getPendingInviteForPair(
        ctx,
        args.communityId,
        user._id,
      )
      if (pending) {
        alreadyInvited.push(entry)
        continue
      }
      matches.push({
        entry,
        userId: user._id,
        name: user.name,
        username: user.username ?? null,
        email: user.email,
      })
    }

    return {
      matches,
      alreadyMembers,
      alreadyInvited,
      misses,
    }
  },
})

// Bulk invite via email list. Admin-only. Emails are normalized (trimmed,
// lowercased). Returns per-bucket reports so the UI can show a summary.
// Cap per call: 200 entries.
export const inviteManyByEmail = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    emails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")
    const admin = await ctx.db.get(callerId)
    const adminName = admin?.name ?? "Someone"

    const entries = parseBulkList(args.emails, MAX_BULK)

    const invited: Id<"users">[] = []
    const alreadyMembers: string[] = []
    const alreadyInvited: string[] = []
    const misses: string[] = []

    for (const entry of entries) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", entry))
        .unique()
      if (!user) {
        misses.push(entry)
        continue
      }
      const r = await inviteOneAsAdmin(ctx, {
        communityId: args.communityId,
        community,
        targetUserId: user._id,
        adminId: callerId,
        adminName,
      })
      switch (r.status) {
        case "created":
          invited.push(user._id)
          break
        case "alreadyMember":
        case "self":
          alreadyMembers.push(entry)
          break
        case "alreadyInvited":
          alreadyInvited.push(entry)
          break
      }
    }

    return { invited, alreadyMembers, alreadyInvited, misses }
  },
})

// Bulk invite via username list. Same shape as inviteManyByEmail. Usernames
// are stored lowercase on the users row, so we strip leading `@` and
// lowercase before the index lookup.
export const inviteManyByUsername = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    usernames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")
    const admin = await ctx.db.get(callerId)
    const adminName = admin?.name ?? "Someone"

    const entries = parseBulkList(args.usernames, MAX_BULK)

    const invited: Id<"users">[] = []
    const alreadyMembers: string[] = []
    const alreadyInvited: string[] = []
    const misses: string[] = []

    for (const entry of entries) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", entry))
        .unique()
      if (!user) {
        misses.push(entry)
        continue
      }
      const r = await inviteOneAsAdmin(ctx, {
        communityId: args.communityId,
        community,
        targetUserId: user._id,
        adminId: callerId,
        adminName,
      })
      switch (r.status) {
        case "created":
          invited.push(user._id)
          break
        case "alreadyMember":
        case "self":
          alreadyMembers.push(entry)
          break
        case "alreadyInvited":
          alreadyInvited.push(entry)
          break
      }
    }

    return { invited, alreadyMembers, alreadyInvited, misses }
  },
})

// Accept a pending invite. Target user only. Creates the member row + bumps
// `memberCount`. No-op if the user is already a member (e.g. they joined via
// an approved request in parallel) — the invite still gets marked accepted
// so it leaves the pending list.
export const acceptInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    inviteId: v.id("communityInvites"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const invite = await ctx.db.get(args.inviteId)
    if (!invite) throw new Error("Invite not found")
    if (invite.userId !== callerId) {
      throw new Error("You can only respond to your own invite")
    }
    if (invite.status !== "pending") {
      throw new Error("Invite is no longer pending")
    }

    const community = await ctx.db.get(invite.communityId)
    if (!community) throw new Error("Community not found")

    const now = Date.now()

    const existing = await getMembership(ctx, invite.communityId, callerId)
    if (!existing) {
      await ctx.db.insert("communityMembers", {
        communityId: invite.communityId,
        userId: callerId,
        role: "member",
        joinedAt: now,
        addedBy: invite.invitedBy,
      })
      await ctx.db.patch(invite.communityId, {
        memberCount: community.memberCount + 1,
      })
    }

    await ctx.db.patch(args.inviteId, {
      status: "accepted",
      respondedAt: now,
    })
  },
})

// Decline a pending invite. Target user only. The invite is marked declined
// but no further action is taken — the admin may send a new invite later.
export const declineInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    inviteId: v.id("communityInvites"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const invite = await ctx.db.get(args.inviteId)
    if (!invite) throw new Error("Invite not found")
    if (invite.userId !== callerId) {
      throw new Error("You can only respond to your own invite")
    }
    if (invite.status !== "pending") {
      throw new Error("Invite is no longer pending")
    }
    await ctx.db.patch(args.inviteId, {
      status: "declined",
      respondedAt: Date.now(),
    })
  },
})

// Revoke a pending invite. Admin-only. Marks the row cancelled so the
// invitee sees it drop out of their pending list; the row is kept so the
// admin-side audit log remains intact.
export const cancelInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    inviteId: v.id("communityInvites"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const invite = await ctx.db.get(args.inviteId)
    if (!invite) throw new Error("Invite not found")
    await requireCommunityRole(ctx, callerId, invite.communityId, "admin")
    if (invite.status !== "pending") {
      throw new Error("Invite is no longer pending")
    }
    await ctx.db.patch(args.inviteId, {
      status: "cancelled",
      respondedAt: Date.now(),
    })
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// List the community's pending invites with invitee + inviter enrichment.
// Admin-only.
export const listInvitesForCommunity = query({
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
      .query("communityInvites")
      .withIndex("by_community_and_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "pending"),
      )
      .collect()

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const invitee = await ctx.db.get(row.userId)
        const inviter = await ctx.db.get(row.invitedBy)
        return {
          invite: row,
          invitee: invitee
            ? {
                _id: invitee._id,
                name: invitee.name,
                username: invitee.username ?? null,
                email: invitee.email,
                avatar: invitee.avatar ?? null,
              }
            : null,
          invitedByName: inviter?.name ?? null,
        }
      }),
    )

    enriched.sort((a, b) => b.invite.createdAt - a.invite.createdAt)
    return enriched
  },
})

// Pending invites addressed to the caller, newest first, with community
// metadata joined in. Drives the Invites tab on `/dashboard/communities`.
export const listMyPendingInvites = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const rows = await ctx.db
      .query("communityInvites")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", callerId).eq("status", "pending"),
      )
      .collect()

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const community = await ctx.db.get(row.communityId)
        const inviter = await ctx.db.get(row.invitedBy)
        return {
          invite: row,
          community: community
            ? {
                _id: community._id,
                name: community.name,
                slug: community.slug,
                description: community.description,
                avatarUrl: community.avatarUrl ?? null,
                coverImageUrl: community.coverImageUrl ?? null,
                memberCount: community.memberCount,
                category: community.category,
              }
            : null,
          invitedByName: inviter?.name ?? null,
        }
      }),
    )

    const filtered = enriched.filter((r) => r.community !== null)
    filtered.sort((a, b) => b.invite.createdAt - a.invite.createdAt)
    return filtered
  },
})
