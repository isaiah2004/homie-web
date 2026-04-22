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
import {
  getCallerUserId,
  requireBusinessRole,
  type BusinessRole,
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
  businessId: Id<"businesses">,
  userId: Id<"users">,
): Promise<Doc<"businessMembers"> | null> {
  return await ctx.db
    .query("businessMembers")
    .withIndex("by_business_and_user", (q) =>
      q.eq("businessId", businessId).eq("userId", userId),
    )
    .unique()
}

const BUSINESS_MEMBER_ROLE_VALIDATOR = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee"),
)

// Restricted role validator for mutations that can assign a role — owner
// is reserved for the creator and cannot be granted or revoked via the
// member mutations (guards against accidental ownership transfer).
const ASSIGNABLE_ROLE_VALIDATOR = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee"),
)

// Also adds the new member to every org channel of the business. Keeping
// channel membership in sync with business membership means the chat
// sidebar "just works" for a newly-added employee.
async function addToAllOrgChannels(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
): Promise<void> {
  const channels = await ctx.db
    .query("orgChannels")
    .withIndex("by_business", (q) => q.eq("businessId", businessId))
    .collect()
  const now = Date.now()
  for (const ch of channels) {
    const existing = await ctx.db
      .query("orgChannelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", ch._id).eq("userId", userId),
      )
      .unique()
    if (existing) continue
    await ctx.db.insert("orgChannelMembers", {
      channelId: ch._id,
      userId,
      joinedAt: now,
    })
  }
}

async function removeFromAllOrgChannels(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
): Promise<void> {
  const channels = await ctx.db
    .query("orgChannels")
    .withIndex("by_business", (q) => q.eq("businessId", businessId))
    .collect()
  for (const ch of channels) {
    const existing = await ctx.db
      .query("orgChannelMembers")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channelId", ch._id).eq("userId", userId),
      )
      .unique()
    if (existing) {
      await ctx.db.delete(existing._id)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Add a member by user id. Admin+ only. Deduplicates against existing
// rows so calling twice is a no-op rather than an error. Schedules a
// `business_member_invite` notification out-of-band so the insert is
// not coupled to notification delivery.
export const addMember = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    targetUserId: v.id("users"),
    role: ASSIGNABLE_ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const target = await ctx.db.get(args.targetUserId)
    if (!target) throw new Error("User not found")

    const existing = await getMembership(
      ctx,
      args.businessId,
      args.targetUserId,
    )
    if (existing) {
      // Dedupe: if the row is already there, we silently succeed rather
      // than throwing. Role changes should go through `updateMemberRole`.
      return existing._id
    }

    const business = await ctx.db.get(args.businessId)
    if (!business) throw new Error("Business not found")

    const now = Date.now()
    const memberId = await ctx.db.insert("businessMembers", {
      businessId: args.businessId,
      userId: args.targetUserId,
      role: args.role,
      addedAt: now,
      addedBy: callerId,
    })
    await addToAllOrgChannels(ctx, args.businessId, args.targetUserId)

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.targetUserId,
        type: "business_member_invite",
        title: `You were added to ${business.name}`,
        body: `Role: ${args.role}`,
        link: `/dashboard/businesses/${args.businessId}`,
        meta: { businessId: args.businessId, role: args.role },
      },
    )

    return memberId
  },
})

// Add a member by email. Looks up the `users` row and defers to the id-based
// flow so validation + notification logic stay in one place.
export const addMemberByEmail = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    email: v.string(),
    role: ASSIGNABLE_ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const normalized = args.email.trim().toLowerCase()
    if (!normalized) throw new Error("Email is required")
    const target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .unique()
    if (!target) throw new Error("No user with that email")

    const existing = await getMembership(ctx, args.businessId, target._id)
    if (existing) return existing._id

    const business = await ctx.db.get(args.businessId)
    if (!business) throw new Error("Business not found")

    const now = Date.now()
    const memberId = await ctx.db.insert("businessMembers", {
      businessId: args.businessId,
      userId: target._id,
      role: args.role,
      addedAt: now,
      addedBy: callerId,
    })
    await addToAllOrgChannels(ctx, args.businessId, target._id)

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: target._id,
        type: "business_member_invite",
        title: `You were added to ${business.name}`,
        body: `Role: ${args.role}`,
        link: `/dashboard/businesses/${args.businessId}`,
        meta: { businessId: args.businessId, role: args.role },
      },
    )

    return memberId
  },
})

// Remove a member. Admin+ only. Owner is immutable — an admin cannot
// remove the owner (prevents a rogue admin from taking over a business).
// Also drops the user from every org channel of the business.
export const removeMember = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const target = await getMembership(
      ctx,
      args.businessId,
      args.targetUserId,
    )
    if (!target) throw new Error("User is not a member")
    if (target.role === "owner") {
      throw new Error("Cannot remove the owner")
    }

    const business = await ctx.db.get(args.businessId)
    if (!business) throw new Error("Business not found")

    await ctx.db.delete(target._id)
    await removeFromAllOrgChannels(
      ctx,
      args.businessId,
      args.targetUserId,
    )

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.targetUserId,
        type: "business_role_changed",
        title: `You were removed from ${business.name}`,
        body: "You no longer have access to this business.",
        link: `/dashboard/businesses`,
        meta: { businessId: args.businessId, removed: true },
      },
    )
  },
})

// Change a member's role. Admin+ only. Owner is immutable — the owner
// role is neither grantable nor revocable via the member mutations.
export const updateMemberRole = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    targetUserId: v.id("users"),
    newRole: ASSIGNABLE_ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const target = await getMembership(
      ctx,
      args.businessId,
      args.targetUserId,
    )
    if (!target) throw new Error("User is not a member")
    if (target.role === "owner") {
      throw new Error("Cannot change the owner's role")
    }
    if (target.role === args.newRole) return

    const business = await ctx.db.get(args.businessId)
    if (!business) throw new Error("Business not found")

    await ctx.db.patch(target._id, { role: args.newRole })

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.targetUserId,
        type: "business_role_changed",
        title: `Your role at ${business.name} changed`,
        body: `New role: ${args.newRole}`,
        link: `/dashboard/businesses/${args.businessId}`,
        meta: { businessId: args.businessId, role: args.newRole },
      },
    )
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// List every member with their enriched user doc. Member-only — callers
// who aren't in the business see an error rather than a silent empty list
// so the UI can route them to a "Not allowed" state.
export const listMembers = query({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const me = await getMembership(ctx, args.businessId, callerId)
    if (!me) throw new Error("Not a business member")

    const rows = await ctx.db
      .query("businessMembers")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect()

    const enriched = await Promise.all(
      rows.map(async (m) => ({
        membership: m,
        user: await ctx.db.get(m.userId),
      })),
    )
    return {
      members: enriched,
      myRole: me.role as BusinessRole,
      myUserId: callerId,
    }
  },
})

// Keep the role validators reachable from other files (e.g. tests).
export const businessMemberRoleValidator = BUSINESS_MEMBER_ROLE_VALIDATOR
