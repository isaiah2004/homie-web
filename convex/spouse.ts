import { v } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";
import { getCallerUserId } from "./_lib/authz";
import { sortedSpousePair } from "./_lib/familyAuthz";

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  return await getCallerUserId(ctx, { email: identity.email });
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Returns all active and pending spouse links for the caller (in either
// direction). The UI splits them on `direction === "in"|"out"` for invite
// vs accepted lists.
export const listMySpouseLinks = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const asA = await ctx.db
      .query("spouseLinks")
      .withIndex("by_userA_and_status", (q) => q.eq("userAId", callerId))
      .collect();
    const asB = await ctx.db
      .query("spouseLinks")
      .withIndex("by_userB_and_status", (q) => q.eq("userBId", callerId))
      .collect();
    const all = [...asA, ...asB];
    const out = [] as Array<{
      link: Doc<"spouseLinks">;
      otherUser: Doc<"users"> | null;
      direction: "incoming" | "outgoing";
      mySharesEnabled: boolean;
      otherSharesEnabled: boolean;
    }>;
    for (const link of all) {
      if (link.status === "revoked") continue;
      const otherUserId = link.userAId === callerId ? link.userBId : link.userAId;
      const otherUser = await ctx.db.get(otherUserId);
      const direction =
        link.invitedBy === callerId ? "outgoing" : "incoming";
      const viewerIsA = link.userAId === callerId;
      out.push({
        link,
        otherUser,
        direction,
        mySharesEnabled: viewerIsA ? link.aSharesCalendar : link.bSharesCalendar,
        otherSharesEnabled: viewerIsA ? link.bSharesCalendar : link.aSharesCalendar,
      });
    }
    return out;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export const inviteSpouse = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    targetEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const caller = await ctx.db.get(callerId);
    if (!caller) throw new Error("Caller not found");
    if (caller.isChild) throw new Error("Children cannot invite spouses");
    const targetEmail = args.targetEmail.trim().toLowerCase();
    const target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", targetEmail))
      .unique();
    if (!target) throw new Error("No user with that email");
    if (target._id === callerId) throw new Error("Cannot invite yourself");
    if (target.isChild) throw new Error("Cannot invite a child as a spouse");
    const { userAId, userBId } = sortedSpousePair(callerId, target._id);
    const existing = await ctx.db
      .query("spouseLinks")
      .withIndex("by_pair", (q) =>
        q.eq("userAId", userAId).eq("userBId", userBId),
      )
      .unique();
    if (existing) {
      if (existing.status === "active") throw new Error("Already linked");
      if (existing.status === "pending") {
        return { linkId: existing._id, status: "alreadyInvited" as const };
      }
      // revoked → reuse
      await ctx.db.patch(existing._id, {
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
          type: "spouse_invite",
          title: `${caller.name} invited you as a spouse`,
          body: undefined,
          link: "/dashboard/family/spouse",
          meta: { linkId: existing._id, fromUserId: callerId },
        },
      );
      return { linkId: existing._id, status: "reinvited" as const };
    }
    const linkId = await ctx.db.insert("spouseLinks", {
      userAId,
      userBId,
      status: "pending",
      invitedBy: callerId,
      aSharesCalendar: true,
      bSharesCalendar: true,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: target._id,
        type: "spouse_invite",
        title: `${caller.name} invited you as a spouse`,
        body: undefined,
        link: "/dashboard/family/spouse",
        meta: { linkId, fromUserId: callerId },
      },
    );
    return { linkId, status: "created" as const };
  },
});

export const acceptSpouseInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("spouseLinks"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Invite not found");
    if (link.status !== "pending") throw new Error("Invite is no longer pending");
    if (link.userAId !== callerId && link.userBId !== callerId) {
      throw new Error("Not your invite");
    }
    if (link.invitedBy === callerId) {
      throw new Error("You sent this invite — wait for the other person");
    }
    await ctx.db.patch(args.linkId, {
      status: "active",
      acceptedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.createNotification,
      {
        userId: link.invitedBy,
        type: "spouse_invite_accepted",
        title: "Your spouse invite was accepted",
        body: undefined,
        link: "/dashboard/family/spouse",
        meta: { linkId: args.linkId },
      },
    );
    return { ok: true };
  },
});

export const declineSpouseInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("spouseLinks"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Invite not found");
    if (link.status !== "pending") throw new Error("Invite is no longer pending");
    if (link.userAId !== callerId && link.userBId !== callerId) {
      throw new Error("Not your invite");
    }
    await ctx.db.patch(args.linkId, { status: "revoked", revokedAt: Date.now() });
    return { ok: true };
  },
});

export const setSpouseCalendarShare = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("spouseLinks"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    if (link.status !== "active") throw new Error("Link is not active");
    if (link.userAId !== callerId && link.userBId !== callerId) {
      throw new Error("Not your link");
    }
    const viewerIsA = link.userAId === callerId;
    if (viewerIsA) {
      await ctx.db.patch(args.linkId, { aSharesCalendar: args.enabled });
    } else {
      await ctx.db.patch(args.linkId, { bSharesCalendar: args.enabled });
    }
    return { ok: true };
  },
});

export const revokeSpouseLink = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    linkId: v.id("spouseLinks"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    if (link.userAId !== callerId && link.userBId !== callerId) {
      throw new Error("Not your link");
    }
    await ctx.db.patch(args.linkId, {
      status: "revoked",
      revokedAt: Date.now(),
    });
    return { ok: true };
  },
});

// Spouse-side calendar query: returns the OTHER spouse's Homie events,
// gated by their `bSharesCalendar` (if other = B) or `aSharesCalendar`.
export const listSpouseCalendar = query({
  args: {
    devUserId: v.optional(v.id("users")),
    spouseUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const { userAId, userBId } = sortedSpousePair(callerId, args.spouseUserId);
    const link = await ctx.db
      .query("spouseLinks")
      .withIndex("by_pair", (q) =>
        q.eq("userAId", userAId).eq("userBId", userBId),
      )
      .unique();
    if (!link || link.status !== "active") {
      throw new Error("Not active spouses");
    }
    const otherIsA = args.spouseUserId === userAId;
    const otherShares = otherIsA ? link.aSharesCalendar : link.bSharesCalendar;
    if (!otherShares) {
      return { sharing: false, events: [] };
    }
    // Reads spouse's events as creator + as invitee.
    const created = await ctx.db
      .query("events")
      .withIndex("by_creator", (q) => q.eq("createdBy", args.spouseUserId))
      .collect();
    const invitedTo = await ctx.db
      .query("eventInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", args.spouseUserId))
      .collect();
    const eventIds = new Set<string>(created.map((e) => e._id as unknown as string));
    const events: Doc<"events">[] = [...created];
    for (const invite of invitedTo) {
      if (invite.status === "declined") continue;
      const eid = invite.eventId as unknown as string;
      if (eventIds.has(eid)) continue;
      const evt = await ctx.db.get(invite.eventId);
      if (evt) {
        events.push(evt);
        eventIds.add(eid);
      }
    }
    events.sort((a, b) => a.startsAt - b.startsAt);
    return { sharing: true, events };
  },
});

// Parent-side calendar query: returns child's Homie events. Gated by
// `flags.calendarVisibleToParents` (default true). Logs a viewed_calendar
// audit row.
export const listChildCalendar = mutation({
  // Mutation (not query) so it can write to familyAuditLog.
  args: {
    devUserId: v.optional(v.id("users")),
    childId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, args);
    const link = await ctx.db
      .query("familyLinks")
      .withIndex("by_pair", (q) =>
        q.eq("parentUserId", callerId).eq("childUserId", args.childId),
      )
      .unique();
    if (!link || link.status !== "active") {
      throw new Error("Not an active guardian");
    }
    const settings = await ctx.db
      .query("childSettings")
      .withIndex("by_child", (q) => q.eq("childUserId", args.childId))
      .unique();
    const flag = settings?.flags.calendarVisibleToParents ?? true;
    if (!flag) {
      return { allowed: false, events: [] };
    }
    const created = await ctx.db
      .query("events")
      .withIndex("by_creator", (q) => q.eq("createdBy", args.childId))
      .collect();
    const invitedTo = await ctx.db
      .query("eventInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", args.childId))
      .collect();
    const eventIds = new Set<string>(created.map((e) => e._id as unknown as string));
    const events: Doc<"events">[] = [...created];
    for (const invite of invitedTo) {
      if (invite.status === "declined") continue;
      const eid = invite.eventId as unknown as string;
      if (eventIds.has(eid)) continue;
      const evt = await ctx.db.get(invite.eventId);
      if (evt) {
        events.push(evt);
        eventIds.add(eid);
      }
    }
    events.sort((a, b) => a.startsAt - b.startsAt);
    await ctx.db.insert("familyAuditLog", {
      childUserId: args.childId,
      actorUserId: callerId,
      action: "viewed_calendar",
      meta: { count: events.length },
      createdAt: Date.now(),
    });
    return { allowed: true, events };
  },
});
