import { v } from "convex/values"
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import { getCallerUserId, requireCommunityRole } from "./_lib/authz"
import { currentMondayUTCms } from "./_lib/time"

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

// Assert that `userId` is any kind of member of `communityId`. Placement
// reads are open to every member regardless of role; role gating only
// applies to the admin-side picker (`pickAd`).
async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers">> {
  const membership = await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_user", (q) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .unique()
  if (!membership) throw new Error("Not a community member")
  return membership
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Member-only listing of placements for a given week. Returns the placement
// row joined to its ad doc so callers can render the sidebar <AdCard/> with a
// single round-trip. `week` defaults to "this Monday" in UTC.
export const listPlacementsForCommunity = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    week: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireMembership(ctx, args.communityId, callerId)

    const weekStart = args.week ?? currentMondayUTCms()
    const placements = await ctx.db
      .query("communityAdPlacements")
      .withIndex("by_community_and_week", (q) =>
        q.eq("communityId", args.communityId).eq("weekStart", weekStart),
      )
      .take(50)

    const rows = await Promise.all(
      placements.map(async (placement) => {
        const ad = await ctx.db.get(placement.adId)
        if (!ad) return null
        const business = await ctx.db.get(ad.advertiserBusinessId)
        return { placement, ad, business }
      }),
    )
    return rows.filter((r): r is NonNullable<typeof r> => r !== null)
  },
})

// Admin-only listing of approved/running ads available to be picked in a
// paid-tier community. Enforces `admin` role; use the public
// `api.ads.listApprovedAds` for any non-admin paths.
export const listAvailableAds = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const approved = await ctx.db
      .query("ads")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(100)
    const running = await ctx.db
      .query("ads")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(100)
    const ads = [...approved, ...running]

    // Attach the business so the picker dropdown can show "Title · Business".
    const rows = await Promise.all(
      ads.map(async (ad) => {
        const business = await ctx.db.get(ad.advertiserBusinessId)
        return { ad, business }
      }),
    )
    return rows
  },
})

// Caller's saved coupons list. Returns the coupon row joined to the ad +
// business so the /my-coupons page can render without a follow-up batch.
export const listSavedCoupons = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const saves = await ctx.db
      .query("savedCoupons")
      .withIndex("by_user", (q) => q.eq("userId", callerId))
      .order("desc")
      .take(200)
    const rows = await Promise.all(
      saves.map(async (saved) => {
        const ad = await ctx.db.get(saved.adId)
        if (!ad) return null
        const business = await ctx.db.get(ad.advertiserBusinessId)
        return { saved, ad, business }
      }),
    )
    return rows.filter((r): r is NonNullable<typeof r> => r !== null)
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Paid-tier admin picks the ad shown in their community's sidebar for the
// current week. Free-tier communities use auto-rotation only; callers
// should gate their UI on `community.isPaid` before invoking this.
// Upserts on (community, weekStart).
export const pickAd = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")
    if (community.isPaid === false) {
      throw new Error(
        "Free-tier communities get an auto-rotated ad each week. Upgrade to pick.",
      )
    }

    const ad = await ctx.db.get(args.adId)
    if (!ad) throw new Error("Ad not found")
    if (ad.status !== "approved" && ad.status !== "running") {
      throw new Error(`Ad is not available (status: ${ad.status})`)
    }

    const weekStart = currentMondayUTCms()
    const existing = await ctx.db
      .query("communityAdPlacements")
      .withIndex("by_community_and_week", (q) =>
        q.eq("communityId", args.communityId).eq("weekStart", weekStart),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        adId: args.adId,
        placementType: "admin_pick",
        selectedBy: callerId,
      })
      return existing._id
    }
    const placementId = await ctx.db.insert("communityAdPlacements", {
      communityId: args.communityId,
      adId: args.adId,
      weekStart,
      placementType: "admin_pick",
      selectedBy: callerId,
      createdAt: Date.now(),
    })
    return placementId
  },
})

// Save a coupon from an ad to the caller's wallet. Dedupe on (user, ad):
// a subsequent save for the same ad no-ops and returns the existing row's
// coupon code so the UI can transition to "Saved" idempotently.
export const saveCoupon = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const ad = await ctx.db.get(args.adId)
    if (!ad) throw new Error("Ad not found")
    if (!ad.couponCode) {
      throw new Error("This ad does not have a coupon code")
    }

    const existing = await ctx.db
      .query("savedCoupons")
      .withIndex("by_user_and_ad", (q) =>
        q.eq("userId", callerId).eq("adId", args.adId),
      )
      .unique()
    if (existing) {
      return { couponCode: existing.couponCode, alreadySaved: true as const }
    }
    await ctx.db.insert("savedCoupons", {
      userId: callerId,
      adId: args.adId,
      couponCode: ad.couponCode,
      savedAt: Date.now(),
    })
    // Fire-and-forget couponSaves metric bump. Scheduler decouples the
    // metric write from this transaction so a telemetry hiccup can't
    // block the viewer's wallet update.
    await ctx.scheduler.runAfter(
      0,
      internal.adMetrics.recordCouponSaveInternal,
      { adId: args.adId },
    )
    return { couponCode: ad.couponCode, alreadySaved: false as const }
  },
})

// Mark a saved coupon as used. Silently no-ops if the caller doesn't own
// the row or it's already used — same pattern as `notifications.markRead`.
export const markCouponUsed = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    savedCouponId: v.id("savedCoupons"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const row = await ctx.db.get(args.savedCouponId)
    if (!row) return
    if (row.userId !== callerId) return
    if (row.usedAt !== undefined) return
    await ctx.db.patch(args.savedCouponId, { usedAt: Date.now() })
    // Fire-and-forget couponUses metric bump. Same rationale as
    // saveCoupon — metrics write is decoupled from the patch.
    await ctx.scheduler.runAfter(
      0,
      internal.adMetrics.recordCouponUseInternal,
      { adId: row.adId },
    )
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Internal — shared with the free-tier rotation cron in convex/crons.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Returns every ad that is eligible for placement (approved or running).
// Internal because this bypasses any member / admin gating — it's only
// called by the rotation cron which runs as the system user.
export const listApprovedAdsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const approved = await ctx.db
      .query("ads")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(500)
    const running = await ctx.db
      .query("ads")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(500)
    return [...approved, ...running]
  },
})

// Weekly cron: assigns an auto-rotated ad to every free-tier community that
// doesn't already have a placement for this week.
//
// Semantics:
//   - Only touches communities where `isPaid === false`.
//   - Skips communities that already have a placement for the current week
//     regardless of `placementType` — we don't overwrite an admin_pick even
//     if the community was downgraded mid-week.
//   - If no eligible ads exist, logs and moves on so the cron stays idempotent.
export const rotateFreeTierPlacements = internalMutation({
  args: {},
  handler: async (ctx) => {
    const weekStart = currentMondayUTCms()

    const ads: Doc<"ads">[] = await ctx.runQuery(
      internal.communityAds.listApprovedAdsInternal,
      {},
    )
    if (ads.length === 0) {
      console.log(
        "[communityAds.rotateFreeTierPlacements] no eligible ads; skipping",
      )
      return
    }

    // Paginated scan so a large community count doesn't blow the tx limits.
    // 500-per-batch matches other internal bulk loops in this codebase.
    const communities = await ctx.db.query("communities").take(500)
    let inserted = 0
    let skipped = 0
    for (const community of communities) {
      if (community.isPaid !== false) {
        skipped++
        continue
      }
      const existing = await ctx.db
        .query("communityAdPlacements")
        .withIndex("by_community_and_week", (q) =>
          q.eq("communityId", community._id).eq("weekStart", weekStart),
        )
        .unique()
      if (existing) {
        skipped++
        continue
      }
      const ad = ads[Math.floor(Math.random() * ads.length)]
      await ctx.db.insert("communityAdPlacements", {
        communityId: community._id,
        adId: ad._id,
        weekStart,
        placementType: "auto",
        createdAt: Date.now(),
      })
      inserted++
    }
    console.log(
      `[communityAds.rotateFreeTierPlacements] inserted=${inserted} skipped=${skipped} weekStart=${weekStart}`,
    )
  },
})
