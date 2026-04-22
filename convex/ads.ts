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
import { getCallerUserId, requireBusinessRole } from "./_lib/authz"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CAPTION_LEN = 2000

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId })
  return await getCallerUserId(ctx, { email: identity.email })
}

function assertCaption(caption: string): void {
  if (caption.length > MAX_CAPTION_LEN) {
    throw new Error(
      `Caption is too long (${caption.length}/${MAX_CAPTION_LEN} chars)`,
    )
  }
}

async function loadAdOrThrow(
  ctx: QueryCtx | MutationCtx,
  adId: Id<"ads">,
): Promise<Doc<"ads">> {
  const ad = await ctx.db.get(adId)
  if (!ad) throw new Error("Ad not found")
  return ad
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Create a new ad in `draft` status. Caller must be at least a manager
// of the advertising business — ad workflow is business-bounded.
export const createAd = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    title: v.string(),
    subtitle: v.optional(v.string()),
    caption: v.string(),
    ctaLabel: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    budgetPerWeek: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "manager")

    const title = args.title.trim()
    if (title.length < 2) throw new Error("Title is too short")
    const caption = args.caption
    assertCaption(caption)

    const adId = await ctx.db.insert("ads", {
      advertiserBusinessId: args.businessId,
      title,
      subtitle: args.subtitle,
      caption,
      ctaLabel: args.ctaLabel,
      ctaUrl: args.ctaUrl,
      couponCode: args.couponCode,
      imageUrl: args.imageUrl,
      videoUrl: args.videoUrl,
      status: "draft",
      budgetPerWeek: args.budgetPerWeek,
      createdAt: Date.now(),
    })
    return adId
  },
})

// Patch an existing ad. Manager+ of the advertising business.
// `status` transitions are handled by separate mutations so we can attach
// side effects (notifications, metric bucket creation) per transition.
export const updateAd = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
    patch: v.object({
      title: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      caption: v.optional(v.string()),
      ctaLabel: v.optional(v.string()),
      ctaUrl: v.optional(v.string()),
      couponCode: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      videoUrl: v.optional(v.string()),
      budgetPerWeek: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const ad = await loadAdOrThrow(ctx, args.adId)
    await requireBusinessRole(ctx, callerId, ad.advertiserBusinessId, "manager")

    const nextTitle = args.patch.title?.trim()
    if (nextTitle !== undefined && nextTitle.length < 2) {
      throw new Error("Title is too short")
    }
    if (args.patch.caption !== undefined) {
      assertCaption(args.patch.caption)
    }

    const patch = { ...args.patch }
    if (nextTitle !== undefined) patch.title = nextTitle
    await ctx.db.patch(args.adId, patch)
  },
})

// Transition draft → submitted. Manager+. Ads in any other state throw so
// the UI's "Submit" button can stay disabled without a race.
export const submitForApproval = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const ad = await loadAdOrThrow(ctx, args.adId)
    await requireBusinessRole(ctx, callerId, ad.advertiserBusinessId, "manager")

    if (ad.status !== "draft") {
      throw new Error(`Ad is not in draft status (current: ${ad.status})`)
    }
    await ctx.db.patch(args.adId, { status: "submitted" })
  },
})

// Dev-only stub for the approval side. In production this will be gated
// by a platform-admin role; for now any dev-mode caller can flip the flag
// so the end-to-end flow is exercisable without a separate admin app.
// Notifies every owner/admin of the advertising business.
export const approveAd = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    // Still require an identity so we don't leak the approve path to an
    // anonymous caller even in dev.
    await resolveCallerId(ctx, { devUserId: args.devUserId })
    if (process.env.CONVEX_DEV_MODE !== "true") {
      throw new Error("Ad approval is dev-only in this PR")
    }
    const ad = await loadAdOrThrow(ctx, args.adId)
    if (ad.status === "approved" || ad.status === "running") return
    if (ad.status !== "submitted" && ad.status !== "draft") {
      throw new Error(`Cannot approve from status ${ad.status}`)
    }

    await ctx.db.patch(args.adId, { status: "approved" })

    // Fan out to every owner/admin so the ad card in the business
    // dashboard stops showing "submitted" without another round-trip.
    const members = await ctx.db
      .query("businessMembers")
      .withIndex("by_business", (q) =>
        q.eq("businessId", ad.advertiserBusinessId),
      )
      .collect()
    const business = await ctx.db.get(ad.advertiserBusinessId)
    for (const m of members) {
      if (m.role !== "owner" && m.role !== "admin") continue
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId: m.userId,
          type: "ad_approved",
          title: `Ad approved: ${ad.title}`,
          body: business?.name
            ? `Ad "${ad.title}" was approved for ${business.name}.`
            : undefined,
          link: `/dashboard/businesses/${ad.advertiserBusinessId}/ads/${ad._id}`,
          meta: {
            adId: ad._id,
            businessId: ad.advertiserBusinessId,
          },
        },
      )
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// List every ad for a business. Member-gated because draft/submitted ads
// are private to the business before approval.
export const listAdsForBusiness = query({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const membership = await ctx.db
      .query("businessMembers")
      .withIndex("by_business_and_user", (q) =>
        q.eq("businessId", args.businessId).eq("userId", callerId),
      )
      .unique()
    if (!membership) throw new Error("Not a business member")

    return await ctx.db
      .query("ads")
      .withIndex("by_advertiser", (q) =>
        q.eq("advertiserBusinessId", args.businessId),
      )
      .order("desc")
      .take(200)
  },
})

// Single-ad read, member-gated. Returns `null` if the ad doesn't exist or
// the caller isn't a member of the advertiser business.
export const getAdForBusiness = query({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const ad = await ctx.db.get(args.adId)
    if (!ad) return null
    const membership = await ctx.db
      .query("businessMembers")
      .withIndex("by_business_and_user", (q) =>
        q
          .eq("businessId", ad.advertiserBusinessId)
          .eq("userId", callerId),
      )
      .unique()
    if (!membership) return null

    const business = await ctx.db.get(ad.advertiserBusinessId)
    return {
      ad,
      myRole: membership.role,
      business,
    }
  },
})

// Public query returning every approved (or running) ad. Used by community
// surfaces in a later PR; shipped here so the ads table has a public read
// path from day one.
export const listApprovedAds = query({
  args: {},
  handler: async (ctx) => {
    const approved = await ctx.db
      .query("ads")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(100)
    const running = await ctx.db
      .query("ads")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(100)
    return [...approved, ...running]
  },
})
