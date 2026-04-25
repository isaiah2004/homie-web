import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";
import { getCallerUserId } from "./_lib/authz";
import { listGuardians, requireParentOf } from "./_lib/familyAuthz";

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  return await getCallerUserId(ctx, { email: identity.email });
}

const SCOPE = v.union(
  v.literal("dm"),
  v.literal("groupchat"),
  v.literal("friend"),
  v.literal("community"),
);

// Internal: returns the latest existing row for a (child, other, scope)
// triple, or null. Used to decide reuse vs insert.
async function findExistingRequest(
  ctx: QueryCtx | MutationCtx,
  childId: Id<"users">,
  otherId: Id<"users">,
  scope: "dm" | "groupchat" | "friend" | "community",
): Promise<Doc<"crossBandRequests"> | null> {
  const rows = await ctx.db
    .query("crossBandRequests")
    .withIndex("by_pair_and_scope", (q) =>
      q.eq("childUserId", childId).eq("otherUserId", otherId).eq("scope", scope),
    )
    .collect();
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows[0] ?? null;
}

// Used by gates (DM send, friend accept, etc.) to check if a prior approval
// exists. Returns true if there's an approved row for this triple.
export async function hasApprovedRequest(
  ctx: QueryCtx | MutationCtx,
  childId: Id<"users">,
  otherId: Id<"users">,
  scope: "dm" | "groupchat" | "friend" | "community",
): Promise<boolean> {
  const row = await findExistingRequest(ctx, childId, otherId, scope);
  return row?.status === "approved";
}

// Community gate variant: the (child, otherUser, scope) triple isn't a
// natural fit for community joins because there isn't a single "other
// user" — we key by `communityId` on the request row. Convention: stored
// `otherUserId` mirrors `childUserId` so the existing pair-and-scope
// index still resolves the row, and `communityId` distinguishes one
// community from another.
export async function hasApprovedCommunityRequest(
  ctx: QueryCtx | MutationCtx,
  childId: Id<"users">,
  communityId: Id<"communities">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("crossBandRequests")
    .withIndex("by_pair_and_scope", (q) =>
      q.eq("childUserId", childId).eq("otherUserId", childId).eq("scope", "community"),
    )
    .collect();
  return rows.some(
    (r) => r.status === "approved" && r.communityId === communityId,
  );
}

// Internal: ensures a pending request exists for (child, other, scope).
// Reuses any existing pending row; otherwise creates one and notifies all
// guardians. Returns the resulting row id + a status discriminator.
//
// Exposed as a regular helper (not a mutation) so gates can call it inline.
export async function ensurePendingRequest(
  ctx: MutationCtx,
  args: {
    childId: Id<"users">;
    otherId: Id<"users">;
    scope: "dm" | "groupchat" | "friend" | "community";
    communityId?: Id<"communities">;
    groupChatId?: Id<"groupChats">;
    reason?: string;
  },
): Promise<{ id: Id<"crossBandRequests">; created: boolean }> {
  const existing = await findExistingRequest(
    ctx,
    args.childId,
    args.otherId,
    args.scope,
  );
  if (existing && existing.status === "pending") {
    return { id: existing._id, created: false };
  }
  const id = await ctx.db.insert("crossBandRequests", {
    childUserId: args.childId,
    otherUserId: args.otherId,
    scope: args.scope,
    communityId: args.communityId,
    groupChatId: args.groupChatId,
    status: "pending",
    reason: args.reason,
    createdAt: Date.now(),
  });
  // Fan-out notifications to every active guardian.
  const guardians = await listGuardians(ctx, args.childId);
  const childUser = await ctx.db.get(args.childId);
  const otherUser = await ctx.db.get(args.otherId);
  for (const g of guardians) {
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: g.parentUserId,
        type: "parent_approval_needed",
        title: `${childUser?.name ?? "Your child"} needs approval to ${labelForScope(args.scope)} ${otherUser?.name ?? "someone"}`,
        body: args.reason,
        link: `/dashboard/family/${args.childId}/approvals`,
        meta: {
          requestId: id,
          childId: args.childId,
          otherId: args.otherId,
          scope: args.scope,
        },
      },
    );
  }
  return { id, created: true };
}

function labelForScope(s: "dm" | "groupchat" | "friend" | "community"): string {
  switch (s) {
    case "dm":
      return "DM";
    case "groupchat":
      return "join a group chat with";
    case "friend":
      return "be friends with";
    case "community":
      return "join a community with";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public mutations
// ─────────────────────────────────────────────────────────────────────────────

// Child-initiated request — used by UI when the child explicitly asks for
// permission (rather than triggering a request via a blocked DM attempt).
export const requestApproval = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    otherUserId: v.id("users"),
    scope: SCOPE,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const me = await ctx.db.get(callerId);
    if (!me?.isChild) throw new Error("Only children can request approvals");
    return await ensurePendingRequest(ctx, {
      childId: callerId,
      otherId: args.otherUserId,
      scope: args.scope,
      reason: args.reason,
    });
  },
});

// Parent-initiated decision. co_parent+ only (step_parent is read-only).
export const resolveApproval = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    requestId: v.id("crossBandRequests"),
    decision: v.union(v.literal("approved"), v.literal("denied")),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const row = await ctx.db.get(args.requestId);
    if (!row) throw new Error("Request not found");
    await requireParentOf(ctx, callerId, row.childUserId, "co_parent");
    if (row.status !== "pending") {
      throw new Error("Request is no longer pending");
    }
    await ctx.db.patch(args.requestId, {
      status: args.decision,
      approvedBy: callerId,
      respondedAt: Date.now(),
    });
    // Audit + notify child.
    await ctx.db.insert("familyAuditLog", {
      childUserId: row.childUserId,
      actorUserId: callerId,
      action: args.decision === "approved" ? "approved_request" : "denied_request",
      meta: {
        requestId: args.requestId,
        otherUserId: row.otherUserId,
        scope: row.scope,
      },
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: row.childUserId,
        type: args.decision === "approved" ? "parent_approval_granted" : "parent_approval_denied",
        title:
          args.decision === "approved"
            ? "Your guardian approved your request"
            : "Your guardian denied your request",
        body: undefined,
        link: "/dashboard/profile/supervision",
        meta: { requestId: args.requestId, scope: row.scope },
      },
    );
    // If approved + scope === "friend", auto-complete the friendship.
    if (args.decision === "approved" && row.scope === "friend") {
      const mine = await ctx.db
        .query("friends")
        .withIndex("by_user_and_friend", (q) =>
          q.eq("userId", row.childUserId).eq("friendId", row.otherUserId),
        )
        .unique();
      const theirs = await ctx.db
        .query("friends")
        .withIndex("by_user_and_friend", (q) =>
          q.eq("userId", row.otherUserId).eq("friendId", row.childUserId),
        )
        .unique();
      if (mine && theirs && mine.status === "pending" && theirs.status === "pending") {
        await ctx.db.patch(mine._id, { status: "accepted" });
        await ctx.db.patch(theirs._id, { status: "accepted" });
      }
    }
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export const listPendingForChild = query({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "step_parent");
    const rows = await ctx.db
      .query("crossBandRequests")
      .withIndex("by_child_and_status", (q) =>
        q.eq("childUserId", args.childId).eq("status", "pending"),
      )
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const out = [] as Array<{
      row: Doc<"crossBandRequests">;
      other: Doc<"users"> | null;
    }>;
    for (const row of rows) {
      const other = await ctx.db.get(row.otherUserId);
      out.push({ row, other });
    }
    return out;
  },
});

export const listMyPending = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const rows = await ctx.db
      .query("crossBandRequests")
      .withIndex("by_child_and_status", (q) =>
        q.eq("childUserId", callerId).eq("status", "pending"),
      )
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const out = [] as Array<{
      row: Doc<"crossBandRequests">;
      other: Doc<"users"> | null;
    }>;
    for (const row of rows) {
      const other = await ctx.db.get(row.otherUserId);
      out.push({ row, other });
    }
    return out;
  },
});

// Internal: used by gates when they enforce a policy violation. Inserts a
// pending request if none exists. Wrapper around `ensurePendingRequest`
// exposed to other Convex modules via internal.crossBandRequests.
export const internalEnsurePending = internalMutation({
  args: {
    childId: v.id("users"),
    otherId: v.id("users"),
    scope: SCOPE,
    communityId: v.optional(v.id("communities")),
    groupChatId: v.optional(v.id("groupChats")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ensurePendingRequest(ctx, args);
  },
});
