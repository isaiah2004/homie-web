import { v } from "convex/values"
import {
  query,
  mutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
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

// Slugify a business name:
//   - lowercase ASCII
//   - replace every non-alphanumeric run with a single hyphen
//   - strip leading / trailing hyphens
//   - fall back to "business" if the input reduces to empty (e.g. non-Latin
//     names) so we never insert an empty slug
function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base.length > 0 ? base : "business"
}

// Append `-2`, `-3`, etc. until the slug is unused. Bounded so a pathological
// collision loop can't starve the mutation.
async function generateUniqueSlug(
  ctx: MutationCtx,
  desired: string,
): Promise<string> {
  const base = slugifyName(desired)
  const existing = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", base))
    .unique()
  if (!existing) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    const collision = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique()
    if (!collision) return candidate
  }
  // Fall back to a timestamp suffix — astronomically unlikely to collide.
  return `${base}-${Date.now()}`
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

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Create a new business. The caller becomes the `owner` member, a default
// "general" org channel is provisioned, and the caller is added to it. All
// three inserts happen in a single mutation so a half-created business
// never shows up in any list query.
export const createBusiness = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    name: v.string(),
    category: v.union(
      v.literal("restaurant"),
      v.literal("retail"),
      v.literal("fitness"),
      v.literal("tech"),
      v.literal("service"),
      v.literal("other"),
    ),
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    locationAddress: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })

    const name = args.name.trim()
    if (name.length < 2) throw new Error("Business name is too short")

    const slug = await generateUniqueSlug(ctx, name)
    const now = Date.now()

    const businessId = await ctx.db.insert("businesses", {
      name,
      slug,
      description: args.description,
      category: args.category,
      website: args.website,
      logoUrl: args.logoUrl,
      coverImageUrl: args.coverImageUrl,
      locationAddress: args.locationAddress,
      locationLat: args.locationLat,
      locationLng: args.locationLng,
      createdBy: callerId,
      createdAt: now,
      verified: false,
      isPaid: false,
    })

    await ctx.db.insert("businessMembers", {
      businessId,
      userId: callerId,
      role: "owner",
      addedAt: now,
      addedBy: callerId,
    })

    const channelId = await ctx.db.insert("orgChannels", {
      businessId,
      name: "general",
      createdAt: now,
    })
    await ctx.db.insert("orgChannelMembers", {
      channelId,
      userId: callerId,
      joinedAt: now,
    })

    return businessId
  },
})

// Edit business metadata. Admin+ only. All fields are optional — only
// supplied keys are patched.
export const updateBusiness = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      category: v.optional(
        v.union(
          v.literal("restaurant"),
          v.literal("retail"),
          v.literal("fitness"),
          v.literal("tech"),
          v.literal("service"),
          v.literal("other"),
        ),
      ),
      website: v.optional(v.string()),
      logoUrl: v.optional(v.string()),
      coverImageUrl: v.optional(v.string()),
      locationAddress: v.optional(v.string()),
      locationLat: v.optional(v.number()),
      locationLng: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "admin")

    const business = await ctx.db.get(args.businessId)
    if (!business) throw new Error("Business not found")

    const nextName = args.patch.name?.trim()
    if (nextName !== undefined && nextName.length < 2) {
      throw new Error("Business name is too short")
    }

    const patch = { ...args.patch }
    if (nextName !== undefined) patch.name = nextName
    await ctx.db.patch(args.businessId, patch)
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Public lookup by slug — used for the business profile route. Returns
// the raw business doc; callers that need the caller's membership status
// should use `getBusinessForViewer` instead.
export const getBusinessBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
  },
})

// Returns the business + the caller's role in that business (if any). A
// non-member caller gets `{ business, myRole: null }` — the business card
// is still public, but role-gated actions are hidden client-side.
export const getBusinessForViewer = query({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const business = await ctx.db.get(args.businessId)
    if (!business) return null
    const membership = await getMembership(ctx, args.businessId, callerId)
    return {
      business,
      myRole: (membership?.role ?? null) as BusinessRole | null,
      myUserId: callerId,
    }
  },
})

// Businesses the caller has any membership in, newest business first.
// Used by the `/dashboard/businesses` list page.
export const listMyBusinesses = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const memberships = await ctx.db
      .query("businessMembers")
      .withIndex("by_user", (q) => q.eq("userId", callerId))
      .collect()
    const rows = await Promise.all(
      memberships.map(async (m) => {
        const business = await ctx.db.get(m.businessId)
        if (!business) return null
        const allMembers = await ctx.db
          .query("businessMembers")
          .withIndex("by_business", (q) =>
            q.eq("businessId", m.businessId),
          )
          .collect()
        return {
          business,
          role: m.role,
          memberCount: allMembers.length,
        }
      }),
    )
    const out = rows.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    )
    out.sort((a, b) => b.business.createdAt - a.business.createdAt)
    return out
  },
})

// Dev-only listing for `/dev/billing`. Returns every business with its
// `isPaid` flag so the admin can toggle. Gated on CONVEX_DEV_MODE; throws
// in production to prevent accidental data exfiltration.
export const listAllForDev = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    // Ensure the caller is resolvable — auth is still required in dev so
    // the switcher has to be set.
    await resolveIdentity(ctx, { devUserId: args.devUserId })
    if (process.env.CONVEX_DEV_MODE !== "true") {
      throw new Error("listAllForDev is only available in dev mode")
    }
    const rows = await ctx.db.query("businesses").take(500)
    return rows
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

// List every member id for a business. Used by internal notification /
// fanout paths so we don't re-query `businessMembers` in three places.
export const listMemberIdsInternal = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const rows = await ctx.db
      .query("businessMembers")
      .withIndex("by_business", (q) => q.eq("businessId", businessId))
      .collect()
    return rows.map((r) => r.userId)
  },
})
