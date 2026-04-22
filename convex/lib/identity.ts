import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"

export type ResolvedIdentity = {
  subject: string
  email: string
  name: string
  tokenIdentifier: string
}

type AnyCtx = QueryCtx | MutationCtx | ActionCtx

// Resolves the calling user's identity, supporting two modes:
//   1. Dev mode (process.env.CONVEX_DEV_MODE === "true") — callers pass
//      `devUserId` from the floating dev switcher and we fabricate an
//      identity by reading the seeded user row.
//   2. Production — delegates to `ctx.auth.getUserIdentity()` which is
//      populated from the Clerk JWT forwarded by ConvexProviderWithClerk.
//
// Callers that previously did
//     const identity = await ctx.auth.getUserIdentity()
//     if (!identity) throw new Error("Not authenticated")
// can replace that with
//     const identity = await resolveIdentity(ctx, { devUserId })
// without changing downstream `identity.subject` / `tokenIdentifier` usage.
export async function resolveIdentity(
  ctx: AnyCtx,
  args: { devUserId?: Id<"users"> }
): Promise<ResolvedIdentity> {
  if (process.env.CONVEX_DEV_MODE === "true" && args.devUserId) {
    // Query / mutation ctx has `ctx.db`; action ctx does not — use runQuery
    // so the lookup works in both runtimes without duplicating logic.
    let user: Doc<"users"> | null
    if ("db" in ctx) {
      const qCtx = ctx as QueryCtx | MutationCtx
      user = await qCtx.db.get(args.devUserId)
    } else {
      const aCtx = ctx as ActionCtx
      const { internal } = await import("../_generated/api")
      user = await aCtx.runQuery(internal.users.getUserInternal, {
        userId: args.devUserId,
      })
    }
    if (!user) throw new Error("Dev user not found")
    return {
      subject: `dev|${user._id}`,
      email: user.email,
      name: user.name,
      tokenIdentifier: `dev|${user._id}`,
    }
  }
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  return {
    subject: identity.subject,
    email: identity.email ?? "",
    name: identity.name ?? identity.email ?? "",
    tokenIdentifier: identity.tokenIdentifier,
  }
}
