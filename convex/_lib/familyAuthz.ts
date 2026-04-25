import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// Role hierarchy for `familyLinks.parentRole`. Mirrors the
// requireBusinessRole / requireCommunityRole pattern in `./authz.ts`.
//
//   step_parent — read-only metadata + calendar; cannot toggle settings or
//                 approve cross-band requests.
//   co_parent   — full settings access; can approve requests; cannot remove
//                 the primary or invite/remove other guardians.
//   primary     — full control: invite / promote / demote / revoke other
//                 guardians; lock or delete the child account.
const PARENT_ROLE_RANK = {
  step_parent: 0,
  co_parent: 1,
  primary: 2,
} as const;

export type ParentRole = keyof typeof PARENT_ROLE_RANK;

// Throws if `parentUserId` is not a guardian of `childUserId` at or above
// `minRole`. Returns the actual role on success so callers can specialize.
export async function requireParentOf(
  ctx: QueryCtx | MutationCtx,
  parentUserId: Id<"users">,
  childUserId: Id<"users">,
  minRole: ParentRole = "step_parent",
): Promise<{ role: ParentRole; link: Doc<"familyLinks"> }> {
  const link = await ctx.db
    .query("familyLinks")
    .withIndex("by_pair", (q) =>
      q.eq("parentUserId", parentUserId).eq("childUserId", childUserId),
    )
    .unique();
  if (!link || link.status !== "active") {
    throw new Error("Not an active guardian of this child");
  }
  if (PARENT_ROLE_RANK[link.parentRole] < PARENT_ROLE_RANK[minRole]) {
    throw new Error(
      `Requires role ${minRole}; have ${link.parentRole}`,
    );
  }
  return { role: link.parentRole, link };
}

// Returns true iff `userId` is the primary parent of any child.
export async function isPrimaryOfAny(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const links = await ctx.db
    .query("familyLinks")
    .withIndex("by_parent_and_status", (q) =>
      q.eq("parentUserId", userId).eq("status", "active"),
    )
    .collect();
  return links.some((l) => l.parentRole === "primary");
}

// Lists active guardians of a child. Used for fan-out on
// notify-all-guardians flows.
export async function listGuardians(
  ctx: QueryCtx | MutationCtx,
  childUserId: Id<"users">,
): Promise<Doc<"familyLinks">[]> {
  return await ctx.db
    .query("familyLinks")
    .withIndex("by_child_and_status", (q) =>
      q.eq("childUserId", childUserId).eq("status", "active"),
    )
    .collect();
}

// Canonical-pair helper for `spouseLinks`. Mirrors `dmConversations.sortedPair`
// — keeps at most one row per (a, b) pair regardless of who initiated.
export function sortedSpousePair(
  a: Id<"users">,
  b: Id<"users">,
): { userAId: Id<"users">; userBId: Id<"users"> } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

// Throws unless an active spouse link exists between `viewerId` and
// `otherId`.  Returns the link so callers can read calendar-share toggles.
export async function requireSpouseOf(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  otherId: Id<"users">,
): Promise<{ link: Doc<"spouseLinks">; viewerSharesWithOther: boolean; otherSharesWithViewer: boolean }> {
  const { userAId, userBId } = sortedSpousePair(viewerId, otherId);
  const link = await ctx.db
    .query("spouseLinks")
    .withIndex("by_pair", (q) =>
      q.eq("userAId", userAId).eq("userBId", userBId),
    )
    .unique();
  if (!link || link.status !== "active") {
    throw new Error("Not active spouses");
  }
  const viewerIsA = viewerId === userAId;
  return {
    link,
    viewerSharesWithOther: viewerIsA ? link.aSharesCalendar : link.bSharesCalendar,
    otherSharesWithViewer: viewerIsA ? link.bSharesCalendar : link.aSharesCalendar,
  };
}

export { PARENT_ROLE_RANK };
