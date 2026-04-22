import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"

// Role hierarchy for `businessMembers`. Ranks compare numerically so
// `requireBusinessRole(ctx, userId, businessId, "manager")` admits any
// membership at or above `manager` (manager/admin/owner).
const BUSINESS_ROLE_RANK = {
  employee: 0,
  manager: 1,
  admin: 2,
  owner: 3,
} as const

export type BusinessRole = keyof typeof BUSINESS_ROLE_RANK

// Throws if `userId` is not a business member or is below `minRole`.
// Returns the actual role on success so callers can specialize behavior
// (e.g. hide an "edit" button for managers but show it to admins).
export async function requireBusinessRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  businessId: Id<"businesses">,
  minRole: BusinessRole,
): Promise<{ role: BusinessRole }> {
  const membership = await ctx.db
    .query("businessMembers")
    .withIndex("by_business_and_user", (q) =>
      q.eq("businessId", businessId).eq("userId", userId),
    )
    .unique()
  if (!membership) throw new Error("Not a business member")
  if (BUSINESS_ROLE_RANK[membership.role] < BUSINESS_ROLE_RANK[minRole]) {
    throw new Error(`Requires role ${minRole}; have ${membership.role}`)
  }
  return { role: membership.role }
}

// Resolves a `ResolvedIdentity` to our `users` row id. Callers should
// usually pair this with `resolveIdentity` from `lib/identity.ts` to get
// the email; we keep this as its own helper so every business/ad mutation
// uses the same lookup + error string.
export async function getCallerUserId(
  ctx: QueryCtx | MutationCtx,
  identity: { email: string },
): Promise<Id<"users">> {
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique()
  if (!user) throw new Error("User not found for identity")
  return user._id
}
