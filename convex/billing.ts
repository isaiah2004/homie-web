import { v } from "convex/values"
import { mutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"

// Dev-only toggle for the `isPaid` flag on a target row. In the live product
// this flag will be flipped by our payments webhook; until then we let a
// dev-mode admin flip it from `/dev/billing` to exercise paid-feature gates.
//
// Only `kind: "business"` is wired for this PR. `kind: "community"` is
// validated but rejected — communities schema lands in PR #6.
export const devMarkPaid = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    kind: v.union(v.literal("business"), v.literal("community")),
    // `id` is loose-typed `v.string()` so we can support community (and
    // other future kinds) without widening this validator. Each branch
    // narrows to the concrete `Id<>` internally.
    id: v.string(),
    paid: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Identity is still required — we never expose an unauthed mutation.
    await resolveIdentity(ctx, { devUserId: args.devUserId })
    if (process.env.CONVEX_DEV_MODE !== "true") {
      throw new Error("devMarkPaid is only available in dev mode")
    }

    if (args.kind === "community") {
      throw new Error("Communities land in PR #6 — not supported yet")
    }

    const businessId = args.id as Id<"businesses">
    const business = await ctx.db.get(businessId)
    if (!business) throw new Error("Business not found")
    await ctx.db.patch(businessId, { isPaid: args.paid })
  },
})
