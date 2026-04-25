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
import { ageBandOf, computeAge } from "./_lib/ageBand";
import {
  requireParentOf,
  listGuardians,
  type ParentRole,
} from "./_lib/familyAuthz";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  return await getCallerUserId(ctx, { email: identity.email });
}

async function logAudit(
  ctx: MutationCtx,
  args: {
    childUserId: Id<"users">;
    actorUserId: Id<"users">;
    action: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.db.insert("familyAuditLog", {
    childUserId: args.childUserId,
    actorUserId: args.actorUserId,
    action: args.action,
    meta: args.meta as Record<string, unknown> | undefined,
    createdAt: Date.now(),
  });
}

async function notifyGuardians(
  ctx: MutationCtx,
  args: {
    childUserId: Id<"users">;
    excludeUserId?: Id<"users">;
    type:
      | "parent_invite"
      | "parent_invite_accepted"
      | "parent_approval_needed"
      | "parent_approval_granted"
      | "parent_approval_denied"
      | "child_settings_changed"
      | "groupchat_age_distribution_flagged";
    title: string;
    body?: string;
    link?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const guardians = await listGuardians(ctx, args.childUserId);
  for (const g of guardians) {
    if (args.excludeUserId && g.parentUserId === args.excludeUserId) continue;
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: g.parentUserId,
        type: args.type,
        title: args.title,
        body: args.body,
        link: args.link,
        meta: args.meta,
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Returns the full family dashboard for the calling parent: every child they
// guardian + each child's settings preview + per-child guardian roster.
export const listMyChildren = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const links = await ctx.db
      .query("familyLinks")
      .withIndex("by_parent_and_status", (q) =>
        q.eq("parentUserId", callerId).eq("status", "active"),
      )
      .collect();
    const children = [] as Array<{
      child: Doc<"users">;
      link: Doc<"familyLinks">;
      settings: Doc<"childSettings"> | null;
      guardians: Array<{ user: Doc<"users"> | null; role: ParentRole }>;
      pendingApprovalCount: number;
    }>;
    for (const link of links) {
      const child = await ctx.db.get(link.childUserId);
      if (!child) continue;
      const settings = await ctx.db
        .query("childSettings")
        .withIndex("by_child", (q) => q.eq("childUserId", link.childUserId))
        .unique();
      const guardianLinks = await ctx.db
        .query("familyLinks")
        .withIndex("by_child_and_status", (q) =>
          q.eq("childUserId", link.childUserId).eq("status", "active"),
        )
        .collect();
      const guardians = [] as Array<{ user: Doc<"users"> | null; role: ParentRole }>;
      for (const gl of guardianLinks) {
        const user = await ctx.db.get(gl.parentUserId);
        guardians.push({ user, role: gl.parentRole });
      }
      const pending = await ctx.db
        .query("crossBandRequests")
        .withIndex("by_child_and_status", (q) =>
          q.eq("childUserId", link.childUserId).eq("status", "pending"),
        )
        .collect();
      children.push({
        child,
        link,
        settings,
        guardians,
        pendingApprovalCount: pending.length,
      });
    }
    return children;
  },
});

// Pending parent-invite rows (you've been invited as a co/step parent for X).
export const listPendingParentInvites = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const rows = await ctx.db
      .query("familyLinks")
      .withIndex("by_parent_and_status", (q) =>
        q.eq("parentUserId", callerId).eq("status", "pending"),
      )
      .collect();
    const out = [] as Array<{
      link: Doc<"familyLinks">;
      child: Doc<"users"> | null;
      invitedBy: Doc<"users"> | null;
    }>;
    for (const link of rows) {
      const child = await ctx.db.get(link.childUserId);
      const invitedBy = link.invitedBy ? await ctx.db.get(link.invitedBy) : null;
      out.push({ link, child, invitedBy });
    }
    return out;
  },
});

// Composite query for a single child detail page. Verifies caller is a
// guardian, returns settings + guardians + counts. Each rendered metadata
// panel logs its OWN audit row at request time (logged by the page-specific
// query, not here, to avoid double-logging on prefetch).
export const getChildOverview = query({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "step_parent");
    const child = await ctx.db.get(args.childId);
    if (!child) throw new Error("Child not found");
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    const guardianLinks = await ctx.db
      .query("familyLinks")
      .withIndex("by_child_and_status", (q) =>
        q.eq("childUserId", args.childId).eq("status", "active"),
      )
      .collect();
    const guardians = [] as Array<{ user: Doc<"users"> | null; role: ParentRole; linkId: Id<"familyLinks"> }>;
    for (const gl of guardianLinks) {
      const user = await ctx.db.get(gl.parentUserId);
      guardians.push({ user, role: gl.parentRole, linkId: gl._id });
    }
    const pending = await ctx.db
      .query("crossBandRequests")
      .withIndex("by_child_and_status", (q) =>
        q.eq("childUserId", args.childId).eq("status", "pending"),
      )
      .collect();
    return {
      child,
      settings,
      guardians,
      pendingApprovals: pending.length,
      childAge: computeAge(child.dob ?? "", Date.now()),
    };
  },
});

// Audit log scoped to a specific child. Visible to all active guardians and
// to the child themselves (the child reads it via the supervision page).
export const listAuditLog = query({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    if (callerId !== args.childId) {
      await requireParentOf(ctx, callerId, args.childId, "step_parent");
    }
    const limit = Math.min(args.limit ?? 100, 500);
    const rows = await ctx.db
      .query("familyAuditLog")
      .withIndex("by_child_and_created", (q) => q.eq("childUserId", args.childId))
      .order("desc")
      .take(limit);
    const out = [] as Array<{
      row: Doc<"familyAuditLog">;
      actor: Doc<"users"> | null;
    }>;
    for (const row of rows) {
      const actor = await ctx.db.get(row.actorUserId);
      out.push({ row, actor });
    }
    return out;
  },
});

// Calling user's own supervision view: are they a child? Which guardians?
// Which flags are on (so they can see what their parent can/cannot view).
export const getMySupervision = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const me = await ctx.db.get(callerId);
    if (!me) return null;
    if (!me.isChild) return null;
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", callerId))
      .unique();
    const guardianLinks = await ctx.db
      .query("familyLinks")
      .withIndex("by_child_and_status", (q) =>
        q.eq("childUserId", callerId).eq("status", "active"),
      )
      .collect();
    const guardians = [] as Array<{ user: Doc<"users"> | null; role: ParentRole }>;
    for (const gl of guardianLinks) {
      const user = await ctx.db.get(gl.parentUserId);
      guardians.push({ user, role: gl.parentRole });
    }
    return {
      me,
      settings,
      guardians,
      childAge: computeAge(me.dob ?? "", Date.now()),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations — child account lifecycle
// ─────────────────────────────────────────────────────────────────────────────

const FLAGS_VALIDATOR = v.object({
  friendApprovalRequired: v.optional(v.boolean()),
  communityApprovalRequired: v.optional(v.boolean()),
  blockNonFriendDms: v.optional(v.boolean()),
  discoverabilityRestricted: v.optional(v.boolean()),
  contentFilterPg13: v.optional(v.boolean()),
  voiceChatAllowed: v.optional(v.boolean()),
  agentDisabled: v.optional(v.boolean()),
  agentRestricted: v.optional(v.boolean()),
  nightLockEnabled: v.optional(v.boolean()),
  parentSeesFriends: v.optional(v.boolean()),
  parentSeesDmPartners: v.optional(v.boolean()),
  parentSeesCommunities: v.optional(v.boolean()),
  parentSeesActivity: v.optional(v.boolean()),
  parentSeesProfile: v.optional(v.boolean()),
  calendarVisibleToParents: v.optional(v.boolean()),
  unlinkAt18: v.optional(v.boolean()),
  accountLocked: v.optional(v.boolean()),
});

// Creates a child account owned by the caller. The caller becomes the
// primary parent. Inserts: users row (isChild: true) + familyLinks
// (parentRole: primary) + default childSettings.
//
// Email handling:
//   - If `email` is provided, it must not collide with an existing users row.
//     This is the future Clerk-claim path: when the child later signs up
//     with this email, getOrCreateUser will reuse this row.
//   - If omitted, we generate a sentinel `child+<uuid>@homie.local` email so
//     the unique-email invariant is preserved. Clerk magic-links won't work
//     for these; today only the parent can act on them via the dashboard.
export const createChildAccount = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    name: v.string(),
    dob: v.string(), // YYYY-MM-DD
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const caller = await ctx.db.get(callerId);
    if (!caller) throw new Error("Caller not found");
    if (caller.isChild) {
      throw new Error("Children cannot create child accounts");
    }
    // Validate dob
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dob)) {
      throw new Error("DOB must be YYYY-MM-DD");
    }
    const childAge = computeAge(args.dob, Date.now());
    if (Number.isNaN(childAge) || childAge < 0 || childAge >= 18) {
      throw new Error("Child must be under 18");
    }
    const band = ageBandOf(childAge);
    // Resolve an email — never collide with an existing user.
    const email = (args.email ?? "").trim().toLowerCase();
    if (email) {
      const collision = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
      if (collision) throw new Error("Email is already in use");
    }
    const finalEmail =
      email ||
      `child+${callerId}-${Date.now().toString(36)}@homie.local`;
    // Username uniqueness (mirror users.getOrCreateUser pattern — best-effort)
    let normalizedUsername: string | undefined = undefined;
    if (args.username) {
      normalizedUsername = args.username.trim().toLowerCase();
      const taken = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", normalizedUsername))
        .unique();
      if (taken) throw new Error("Username is already taken");
    }
    const childUserId = await ctx.db.insert("users", {
      name: args.name.trim() || "Child",
      email: finalEmail,
      username: normalizedUsername,
      avatar: args.avatar,
      accountType: "personal",
      dob: args.dob,
      visibility: "friends",
      isChild: true,
    });
    await ctx.db.insert("familyLinks", {
      parentUserId: callerId,
      childUserId,
      parentRole: "primary",
      status: "active",
      invitedBy: callerId,
      createdAt: Date.now(),
      acceptedAt: Date.now(),
    });
    await ctx.db.insert("childSettings", {
      childUserId,
      ageBand: band,
      childTimezone: args.timezone,
      flags: {},
      nightLockWindow: { start: "22:00", end: "06:00" },
      blockedUserIds: [],
      blockedCommunityIds: [],
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId,
      actorUserId: callerId,
      action: "created_child_account",
      meta: { name: args.name, dob: args.dob, ageBand: band },
    });
    return { childId: childUserId };
  },
});

// Primary-parent-only: invite another adult as co_parent or step_parent.
// Creates a `pending` familyLinks row + fires a `parent_invite` notification.
export const inviteCoParent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    targetEmail: v.string(),
    role: v.union(v.literal("co_parent"), v.literal("step_parent")),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "primary");
    const targetEmail = args.targetEmail.trim().toLowerCase();
    const target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", targetEmail))
      .unique();
    if (!target) throw new Error("No user with that email");
    if (target._id === callerId) throw new Error("You are already the primary parent");
    if (target.isChild) throw new Error("Cannot invite a child as a guardian");
    // Reuse any pending invite for this pair.
    const existing = await ctx.db
      .query("familyLinks")
      .withIndex("by_pair", (q) =>
        q.eq("parentUserId", target._id).eq("childUserId", args.childId),
      )
      .unique();
    if (existing) {
      if (existing.status === "active") throw new Error("Already a guardian");
      if (existing.status === "pending") {
        // Update role if different
        if (existing.parentRole !== args.role) {
          await ctx.db.patch(existing._id, { parentRole: args.role });
        }
        return { linkId: existing._id, status: "alreadyInvited" as const };
      }
      // revoked → reuse the row
      await ctx.db.patch(existing._id, {
        parentRole: args.role,
        status: "pending",
        invitedBy: callerId,
        createdAt: Date.now(),
        revokedAt: undefined,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId: target._id,
          type: "parent_invite",
          title: "You've been invited as a guardian",
          body: undefined,
          link: "/dashboard/family",
          meta: { childId: args.childId, role: args.role },
        },
      );
      return { linkId: existing._id, status: "reinvited" as const };
    }
    const linkId = await ctx.db.insert("familyLinks", {
      parentUserId: target._id,
      childUserId: args.childId,
      parentRole: args.role,
      status: "pending",
      invitedBy: callerId,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: target._id,
        type: "parent_invite",
        title: "You've been invited as a guardian",
        body: undefined,
        link: "/dashboard/family",
        meta: { childId: args.childId, role: args.role },
      },
    );
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: "invited_guardian",
      meta: { targetUserId: target._id, role: args.role },
    });
    return { linkId, status: "created" as const };
  },
});

// Invitee accepts a pending parent invite.
export const acceptParentInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("familyLinks"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Invite not found");
    if (link.parentUserId !== callerId) throw new Error("Not your invite");
    if (link.status !== "pending") throw new Error("Invite is no longer pending");
    await ctx.db.patch(args.linkId, {
      status: "active",
      acceptedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId: link.childUserId,
      actorUserId: callerId,
      action: "accepted_guardian_invite",
      meta: { role: link.parentRole },
    });
    if (link.invitedBy) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId: link.invitedBy,
          type: "parent_invite_accepted",
          title: "Your guardian invite was accepted",
          body: undefined,
          link: `/dashboard/family/${link.childUserId}`,
          meta: { childId: link.childUserId, acceptedBy: callerId },
        },
      );
    }
    return { ok: true };
  },
});

// Decline / cancel: invitee or primary can cancel a pending invite. Active
// guardians are revoked via revokeGuardian (primary only).
export const declineParentInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("familyLinks"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Invite not found");
    if (link.status !== "pending") throw new Error("Invite is no longer pending");
    const isInvitee = link.parentUserId === callerId;
    let isPrimary = false;
    try {
      await requireParentOf(ctx, callerId, link.childUserId, "primary");
      isPrimary = true;
    } catch {
      isPrimary = false;
    }
    if (!isInvitee && !isPrimary) throw new Error("Not authorized");
    await ctx.db.patch(args.linkId, { status: "revoked", revokedAt: Date.now() });
    return { ok: true };
  },
});

// Primary-only: revoke an active guardian (or change their role).
export const revokeGuardian = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("familyLinks"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    await requireParentOf(ctx, callerId, link.childUserId, "primary");
    if (link.parentRole === "primary") {
      throw new Error("Cannot revoke the primary parent");
    }
    await ctx.db.patch(args.linkId, { status: "revoked", revokedAt: Date.now() });
    await logAudit(ctx, {
      childUserId: link.childUserId,
      actorUserId: callerId,
      action: "revoked_guardian",
      meta: { revokedUserId: link.parentUserId, role: link.parentRole },
    });
    return { ok: true };
  },
});

// Primary-only: change a co_parent ↔ step_parent.
export const setGuardianRole = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("familyLinks"),
    role: v.union(v.literal("co_parent"), v.literal("step_parent")),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    await requireParentOf(ctx, callerId, link.childUserId, "primary");
    if (link.parentRole === "primary") {
      throw new Error("Cannot change the primary parent's role");
    }
    if (link.status !== "active") throw new Error("Guardian is not active");
    await ctx.db.patch(args.linkId, { parentRole: args.role });
    await logAudit(ctx, {
      childUserId: link.childUserId,
      actorUserId: callerId,
      action: "changed_guardian_role",
      meta: { targetUserId: link.parentUserId, newRole: args.role },
    });
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations — settings
// ─────────────────────────────────────────────────────────────────────────────

// Sets one or more flags. co_parent+ only (step_parent is read-only).
export const updateChildFlags = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    flags: FLAGS_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "co_parent");
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    if (!settings) throw new Error("Child settings not found");
    const merged = { ...settings.flags };
    for (const k of Object.keys(args.flags) as Array<keyof typeof args.flags>) {
      const v = args.flags[k];
      if (typeof v === "boolean") {
        (merged as Record<string, boolean>)[k as string] = v;
      }
    }
    await ctx.db.patch(settings._id, { flags: merged, updatedAt: Date.now() });
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: "updated_flags",
      meta: { flags: args.flags },
    });
    await notifyGuardians(ctx, {
      childUserId: args.childId,
      excludeUserId: callerId,
      type: "child_settings_changed",
      title: "Child settings updated",
      link: `/dashboard/family/${args.childId}/settings`,
      meta: { changedBy: callerId, flags: args.flags },
    });
    // Notify the child too.
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.childId,
        type: "child_settings_changed",
        title: "Your guardian updated your settings",
        body: undefined,
        link: "/dashboard/profile/supervision",
        meta: { changedBy: callerId, flags: args.flags },
      },
    );
    return { ok: true };
  },
});

export const setChildTimezone = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "co_parent");
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    if (!settings) throw new Error("Child settings not found");
    await ctx.db.patch(settings._id, {
      childTimezone: args.timezone,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: "set_timezone",
      meta: { timezone: args.timezone },
    });
    return { ok: true };
  },
});

export const setNightLockWindow = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    start: v.string(), // "HH:MM"
    end: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "co_parent");
    if (!/^\d{2}:\d{2}$/.test(args.start) || !/^\d{2}:\d{2}$/.test(args.end)) {
      throw new Error("Times must be HH:MM");
    }
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    if (!settings) throw new Error("Child settings not found");
    await ctx.db.patch(settings._id, {
      nightLockWindow: { start: args.start, end: args.end },
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: "set_night_lock_window",
      meta: { start: args.start, end: args.end },
    });
    return { ok: true };
  },
});

export const setBlockedUser = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    targetUserId: v.id("users"),
    blocked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "co_parent");
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    if (!settings) throw new Error("Child settings not found");
    const current = settings.blockedUserIds ?? [];
    const next = args.blocked
      ? [...new Set([...current, args.targetUserId])]
      : current.filter((id) => id !== args.targetUserId);
    await ctx.db.patch(settings._id, {
      blockedUserIds: next,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: args.blocked ? "blocked_user" : "unblocked_user",
      meta: { targetUserId: args.targetUserId },
    });
    return { ok: true };
  },
});

export const setBlockedCommunity = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    communityId: v.id("communities"),
    blocked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "co_parent");
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    if (!settings) throw new Error("Child settings not found");
    const current = settings.blockedCommunityIds ?? [];
    const next = args.blocked
      ? [...new Set([...current, args.communityId])]
      : current.filter((id) => id !== args.communityId);
    await ctx.db.patch(settings._id, {
      blockedCommunityIds: next,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: args.blocked ? "blocked_community" : "unblocked_community",
      meta: { communityId: args.communityId },
    });
    return { ok: true };
  },
});

// Primary-only: lock or unlock the child account (sets accountLocked flag).
export const setAccountLocked = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
    locked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    await requireParentOf(ctx, callerId, args.childId, "primary");
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    if (!settings) throw new Error("Child settings not found");
    await ctx.db.patch(settings._id, {
      flags: { ...settings.flags, accountLocked: args.locked },
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      childUserId: args.childId,
      actorUserId: callerId,
      action: args.locked ? "locked_account" : "unlocked_account",
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: args.childId,
        type: "child_settings_changed",
        title: args.locked ? "Your account has been locked" : "Your account has been unlocked",
        body: undefined,
        link: "/dashboard/profile/supervision",
        meta: { locked: args.locked, by: callerId },
      },
    );
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers used by other modules
// ─────────────────────────────────────────────────────────────────────────────

// Used by gates that need to log a side-effect audit row (e.g. "DM sent
// during night window with close friend"). Internal so general callers
// can't write arbitrary audit rows.
export const internalLogAudit = internalMutation({
  args: {
    childUserId: v.id("users"),
    actorUserId: v.id("users"),
    action: v.string(),
    meta: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("familyAuditLog", {
      childUserId: args.childUserId,
      actorUserId: args.actorUserId,
      action: args.action,
      meta: args.meta,
      createdAt: Date.now(),
    });
  },
});
