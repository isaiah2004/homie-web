import { v } from "convex/values"
import {
  query,
  mutation,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import { getCallerUserId, requireBusinessRole } from "./_lib/authz"
import { lastNDaysBuckets, todayUtcBucket } from "./_lib/time"

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

type MetricField = "impressions" | "clicks" | "couponSaves" | "couponUses"

// Upserts today's metric bucket for `adId`, bumping the specified field by
// one. The pattern is: query by (adId, dateBucket), patch if exists, insert
// if not. There's a tiny race between query and insert/patch that could
// double-count or drop a count under heavy concurrency — that's acceptable
// for fire-and-forget telemetry. Never throws to callers.
async function bumpMetric(
  ctx: MutationCtx,
  adId: Id<"ads">,
  field: MetricField,
): Promise<void> {
  const dateBucket = todayUtcBucket()
  try {
    const existing = await ctx.db
      .query("adMetrics")
      .withIndex("by_ad_and_date", (q) =>
        q.eq("adId", adId).eq("dateBucket", dateBucket),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        [field]: (existing[field] ?? 0) + 1,
      })
      return
    }
    // Fresh row — initialize all counters to 0 except the one we're bumping.
    await ctx.db.insert("adMetrics", {
      adId,
      dateBucket,
      impressions: field === "impressions" ? 1 : 0,
      clicks: field === "clicks" ? 1 : 0,
      couponSaves: field === "couponSaves" ? 1 : 0,
      couponUses: field === "couponUses" ? 1 : 0,
    })
  } catch (err) {
    // Swallow: telemetry must never surface as a user-visible error.
    // Common shape here is a concurrent insert racing us — the next
    // write from the same viewer will simply patch the row the winner
    // inserted.
    console.warn(
      `[adMetrics.bumpMetric] swallowed error adId=${adId} field=${field}`,
      err,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public telemetry mutations
//
// Impressions and clicks are anonymous-ish: we accept an optional
// `devUserId` only so the dev-mode switcher round-trips cleanly, but we
// don't gate on it and never look up the caller. Skipping auth here also
// means the ad card can fire-and-forget these without bubbling a 401.
// ─────────────────────────────────────────────────────────────────────────────

export const recordImpression = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    await bumpMetric(ctx, args.adId, "impressions")
  },
})

export const recordClick = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    await bumpMetric(ctx, args.adId, "clicks")
  },
})

// Coupon save/use are also exposed publicly so the ad-card surface
// *could* call them directly, but the primary path is the scheduler
// invocation from `communityAds.saveCoupon` / `markCouponUsed`.
export const recordCouponSave = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    await bumpMetric(ctx, args.adId, "couponSaves")
  },
})

export const recordCouponUse = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
  },
  handler: async (ctx, args) => {
    await bumpMetric(ctx, args.adId, "couponUses")
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Internal — scheduler targets for coupon events.
//
// These exist so `communityAds.saveCoupon` / `markCouponUsed` can fire the
// counter bump via `ctx.scheduler.runAfter(0, ...)` without coupling the
// save mutation's transaction to the metrics write.
// ─────────────────────────────────────────────────────────────────────────────

export const recordCouponSaveInternal = internalMutation({
  args: { adId: v.id("ads") },
  handler: async (ctx, args) => {
    await bumpMetric(ctx, args.adId, "couponSaves")
  },
})

export const recordCouponUseInternal = internalMutation({
  args: { adId: v.id("ads") },
  handler: async (ctx, args) => {
    await bumpMetric(ctx, args.adId, "couponUses")
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Analytics queries
// ─────────────────────────────────────────────────────────────────────────────

export type AdAnalyticsDay = {
  date: string
  impressions: number
  clicks: number
  couponSaves: number
  couponUses: number
  ctr: number
}

// Per-ad time series. Manager+ of the advertising business. Returns the
// last `days` days padded with zeros for buckets that have no row yet, so
// the chart shows a continuous x-axis.
export const getAdAnalytics = query({
  args: {
    devUserId: v.optional(v.id("users")),
    adId: v.id("ads"),
    days: v.number(),
  },
  handler: async (ctx, args): Promise<AdAnalyticsDay[]> => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const ad = await ctx.db.get(args.adId)
    if (!ad) throw new Error("Ad not found")
    await requireBusinessRole(
      ctx,
      callerId,
      ad.advertiserBusinessId,
      "manager",
    )

    const days = Math.max(1, Math.min(365, Math.floor(args.days)))
    const buckets = lastNDaysBuckets(days)
    const earliest = buckets[0] ?? todayUtcBucket()

    // Single index scan over (adId, dateBucket) — the index is ordered by
    // bucket so we can short-circuit once we're newer than `earliest`.
    // `.take(days)` caps the read to exactly what the chart needs.
    const rows = await ctx.db
      .query("adMetrics")
      .withIndex("by_ad_and_date", (q) =>
        q.eq("adId", args.adId).gte("dateBucket", earliest),
      )
      .take(days)

    const byBucket = new Map<string, Doc<"adMetrics">>()
    for (const row of rows) byBucket.set(row.dateBucket, row)

    return buckets.map((date) => {
      const row = byBucket.get(date)
      const impressions = row?.impressions ?? 0
      const clicks = row?.clicks ?? 0
      return {
        date,
        impressions,
        clicks,
        couponSaves: row?.couponSaves ?? 0,
        couponUses: row?.couponUses ?? 0,
        ctr: impressions > 0 ? clicks / impressions : 0,
      }
    })
  },
})

export type BusinessAnalyticsSummary = {
  totalImpressions: number
  totalClicks: number
  totalSaves: number
  totalUses: number
  overallCtr: number
  perAd: Array<{
    adId: Id<"ads">
    title: string
    status: Doc<"ads">["status"]
    impressions: number
    clicks: number
    ctr: number
    saves: number
    uses: number
    impressions7d: number
  }>
  timeSeries: Array<{
    date: string
    impressions: number
    clicks: number
    saves: number
  }>
}

// Business-wide dashboard aggregate. Manager+ gate. Fetches every ad for
// the business, walks each one's `adMetrics` rows in the last `days`
// window, then rolls up per-ad totals + a combined daily time series.
export const getBusinessAnalyticsSummary = query({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
    days: v.number(),
  },
  handler: async (ctx, args): Promise<BusinessAnalyticsSummary> => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireBusinessRole(ctx, callerId, args.businessId, "manager")

    const days = Math.max(1, Math.min(365, Math.floor(args.days)))
    const buckets = lastNDaysBuckets(days)
    const earliest = buckets[0] ?? todayUtcBucket()
    // 7-day window is always the most recent 7 buckets from `buckets`;
    // use Set for O(1) lookup when rolling up per-ad 7d impressions.
    const last7Buckets = new Set(buckets.slice(Math.max(0, days - 7)))

    const ads = await ctx.db
      .query("ads")
      .withIndex("by_advertiser", (q) =>
        q.eq("advertiserBusinessId", args.businessId),
      )
      .take(500)

    // Per-bucket rollup accumulator for the combined time series.
    const bucketTotals = new Map<
      string,
      { impressions: number; clicks: number; saves: number }
    >()
    for (const b of buckets) {
      bucketTotals.set(b, { impressions: 0, clicks: 0, saves: 0 })
    }

    let totalImpressions = 0
    let totalClicks = 0
    let totalSaves = 0
    let totalUses = 0
    const perAd: BusinessAnalyticsSummary["perAd"] = []

    for (const ad of ads) {
      const rows = await ctx.db
        .query("adMetrics")
        .withIndex("by_ad_and_date", (q) =>
          q.eq("adId", ad._id).gte("dateBucket", earliest),
        )
        .take(days)

      let adImp = 0
      let adClicks = 0
      let adSaves = 0
      let adUses = 0
      let adImp7d = 0
      for (const r of rows) {
        adImp += r.impressions
        adClicks += r.clicks
        adSaves += r.couponSaves
        adUses += r.couponUses
        if (last7Buckets.has(r.dateBucket)) {
          adImp7d += r.impressions
        }
        const bucket = bucketTotals.get(r.dateBucket)
        if (bucket) {
          bucket.impressions += r.impressions
          bucket.clicks += r.clicks
          bucket.saves += r.couponSaves
        }
      }

      perAd.push({
        adId: ad._id,
        title: ad.title,
        status: ad.status,
        impressions: adImp,
        clicks: adClicks,
        ctr: adImp > 0 ? adClicks / adImp : 0,
        saves: adSaves,
        uses: adUses,
        impressions7d: adImp7d,
      })
      totalImpressions += adImp
      totalClicks += adClicks
      totalSaves += adSaves
      totalUses += adUses
    }

    const timeSeries = buckets.map((date) => {
      const t = bucketTotals.get(date)!
      return {
        date,
        impressions: t.impressions,
        clicks: t.clicks,
        saves: t.saves,
      }
    })

    // Sort per-ad rows so active ads with the most impressions float to
    // the top — matches how the dashboard table is most useful.
    perAd.sort((a, b) => b.impressions - a.impressions)

    return {
      totalImpressions,
      totalClicks,
      totalSaves,
      totalUses,
      overallCtr:
        totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      perAd,
      timeSeries,
    }
  },
})
