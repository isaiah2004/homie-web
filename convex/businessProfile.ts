// Business profile CRUD — branches (additional locations) and services
// (goods / services offered). Kept out of `businesses.ts` because that file
// owns the parent business lifecycle; this one is strictly the sub-entity
// editor surface used by BusinessInfoForm on /dashboard/profile.
//
// Authorization model: every write requires `admin` role on the target
// business (owners are implicitly admin+). Reads are unauthenticated — a
// business profile is public (listed on the Businesses page and ads).

import { v } from "convex/values"
import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import { getCallerUserId, requireBusinessRole } from "./_lib/authz"

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId })
  return await getCallerUserId(ctx, { email: identity.email })
}

// ─── Branches ─────────────────────────────────────────────────────────────

export const listBranches = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const rows = await ctx.db
      .query("businessBranches")
      .withIndex("by_business_and_order", (q) =>
        q.eq("businessId", businessId),
      )
      .collect()
    // Secondary sort by creation so ties on displayOrder are stable.
    rows.sort((a, b) =>
      a.displayOrder === b.displayOrder
        ? a.createdAt - b.createdAt
        : a.displayOrder - b.displayOrder,
    )
    return rows
  },
})

export const addBranch = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    name: v.string(),
    address: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    mapsLink: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const name = args.name.trim()
    if (name.length < 1) throw new Error("Branch name cannot be empty")

    // Append to the end — compute max(displayOrder) in O(n) (fine; branches
    // per business are small).
    const existing = await ctx.db
      .query("businessBranches")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect()
    const nextOrder =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((r) => r.displayOrder)) + 1

    return await ctx.db.insert("businessBranches", {
      businessId: args.businessId,
      name,
      address: args.address,
      locationLat: args.locationLat,
      locationLng: args.locationLng,
      mapsLink: args.mapsLink,
      phone: args.phone,
      email: args.email,
      displayOrder: nextOrder,
      createdAt: Date.now(),
    })
  },
})

export const updateBranch = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    branchId: v.id("businessBranches"),
    patch: v.object({
      name: v.optional(v.string()),
      address: v.optional(v.string()),
      locationLat: v.optional(v.number()),
      locationLng: v.optional(v.number()),
      mapsLink: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const branch = await ctx.db.get(args.branchId)
    if (!branch) throw new Error("Branch not found")
    await requireBusinessRole(ctx, callerId, branch.businessId, "admin")

    const patch = { ...args.patch }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (trimmed.length < 1) throw new Error("Branch name cannot be empty")
      patch.name = trimmed
    }
    await ctx.db.patch(args.branchId, patch)
  },
})

export const removeBranch = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    branchId: v.id("businessBranches"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const branch = await ctx.db.get(args.branchId)
    if (!branch) return
    await requireBusinessRole(ctx, callerId, branch.businessId, "admin")
    await ctx.db.delete(args.branchId)
  },
})

// ─── Services / products ──────────────────────────────────────────────────

export const listServices = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const rows = await ctx.db
      .query("businessServices")
      .withIndex("by_business_and_order", (q) =>
        q.eq("businessId", businessId),
      )
      .collect()
    rows.sort((a, b) =>
      a.displayOrder === b.displayOrder
        ? a.createdAt - b.createdAt
        : a.displayOrder - b.displayOrder,
    )
    return rows
  },
})

export const addService = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    priceLabel: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    kind: v.union(v.literal("product"), v.literal("service")),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const name = args.name.trim()
    if (name.length < 1) throw new Error("Name cannot be empty")

    const existing = await ctx.db
      .query("businessServices")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect()
    const nextOrder =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((r) => r.displayOrder)) + 1

    return await ctx.db.insert("businessServices", {
      businessId: args.businessId,
      name,
      description: args.description,
      priceLabel: args.priceLabel,
      imageUrl: args.imageUrl,
      kind: args.kind,
      displayOrder: nextOrder,
      createdAt: Date.now(),
    })
  },
})

export const updateService = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    serviceId: v.id("businessServices"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      priceLabel: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      kind: v.optional(v.union(v.literal("product"), v.literal("service"))),
    }),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const service = await ctx.db.get(args.serviceId)
    if (!service) throw new Error("Service not found")
    await requireBusinessRole(ctx, callerId, service.businessId, "admin")

    const patch = { ...args.patch }
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (trimmed.length < 1) throw new Error("Name cannot be empty")
      patch.name = trimmed
    }
    await ctx.db.patch(args.serviceId, patch)
  },
})

export const removeService = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    serviceId: v.id("businessServices"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const service = await ctx.db.get(args.serviceId)
    if (!service) return
    await requireBusinessRole(ctx, callerId, service.businessId, "admin")
    await ctx.db.delete(args.serviceId)
  },
})
