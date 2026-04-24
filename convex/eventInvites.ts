import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (duplicate of the helpers in events.ts to keep this file
// self-contained — both modules intentionally avoid cross-importing from
// each other to prevent circular module loading surprises).
// ─────────────────────────────────────────────────────────────────────────────

async function resolveViewerId(
  ctx: QueryCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique();
  if (!user) throw new Error("User not found for identity");
  return user._id;
}

async function getInviteForPair(
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
): Promise<Doc<"eventInvites"> | null> {
  return await ctx.db
    .query("eventInvites")
    .withIndex("by_event_and_invitee", (q) =>
      q.eq("eventId", eventId).eq("inviteeId", userId),
    )
    .unique();
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Bulk upsert invites for an event. Only the creator may call this. For each
// userId: if an invite already exists it's left alone (no-op idempotent),
// otherwise a pending row is inserted and a notification is scheduled.
export const inviteToEvent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.createdBy !== viewerId) {
      throw new Error("Only the creator can invite people to this event");
    }
    const creator = await ctx.db.get(viewerId);
    const creatorName = creator?.name ?? "Someone";

    const results: Array<{
      userId: Id<"users">;
      inviteId: Id<"eventInvites"> | null;
      status: "created" | "existing" | "self";
    }> = [];

    for (const userId of args.userIds) {
      if (userId === viewerId) {
        // Skip self-invites silently; the creator is implicitly attending.
        results.push({ userId, inviteId: null, status: "self" });
        continue;
      }
      const existing = await getInviteForPair(ctx, args.eventId, userId);
      if (existing) {
        results.push({
          userId,
          inviteId: existing._id,
          status: "existing",
        });
        continue;
      }
      const inviteId = await ctx.db.insert("eventInvites", {
        eventId: args.eventId,
        inviterId: viewerId,
        inviteeId: userId,
        status: "pending",
        createdAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId,
          type: "event_invite",
          title: `${creatorName} invited you to ${event.name}`,
          body: event.description ?? undefined,
          link: `/dashboard/events/${args.eventId}`,
          meta: { eventId: args.eventId, inviteId },
        },
      );
      results.push({ userId, inviteId, status: "created" });
    }
    return results;
  },
});

export const respondToInvite = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    inviteId: v.id("eventInvites"),
    response: v.union(
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("maybe"),
    ),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.inviteeId !== viewerId) {
      throw new Error("You can only respond to your own invite");
    }
    await ctx.db.patch(args.inviteId, {
      status: args.response,
      respondedAt: Date.now(),
    });

    // Notify the event creator on accept/decline. `maybe` intentionally does
    // not fire a notification — too chatty for a tentative signal.
    if (args.response === "accepted" || args.response === "declined") {
      const event = await ctx.db.get(invite.eventId);
      if (event) {
        const responder = await ctx.db.get(viewerId);
        const responderName = responder?.name ?? "Someone";
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.createNotification,
          {
            userId: event.createdBy,
            type:
              args.response === "accepted"
                ? "event_accepted"
                : "event_declined",
            title:
              args.response === "accepted"
                ? `${responderName} is going to ${event.name}`
                : `${responderName} can't make ${event.name}`,
            link: `/dashboard/events/${invite.eventId}`,
            meta: { eventId: invite.eventId, inviteId: args.inviteId },
          },
        );
      }
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Creator sees every invite on the event (to power the attendee list);
// anyone else only sees their own row (so they can re-read their RSVP).
export const listInvitesForEvent = query({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];
    const isCreator = event.createdBy === viewerId;
    const rows = isCreator
      ? await ctx.db
          .query("eventInvites")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect()
      : await (async () => {
          const own = await getInviteForPair(ctx, args.eventId, viewerId);
          return own ? [own] : [];
        })();
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db.get(row.inviteeId);
        return {
          invite: row,
          user: user
            ? {
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
              }
            : null,
        };
      }),
    );
    return enriched;
  },
});

// All pending invites owned by the caller, soonest-first (by startsAt of
// their associated event). Powers the Invites tab on the events page.
export const listPendingInvitesForMe = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const rows = await ctx.db
      .query("eventInvites")
      .withIndex("by_invitee_and_status", (q) =>
        q.eq("inviteeId", viewerId).eq("status", "pending"),
      )
      .collect();
    const enriched: Array<{
      invite: Doc<"eventInvites">;
      event: Doc<"events"> | null;
      inviter: { _id: Id<"users">; name: string } | null;
    }> = [];
    for (const row of rows) {
      const ev = await ctx.db.get(row.eventId);
      // Skip cancelled events — the pending invite is moot.
      if (!ev || ev.status === "cancelled") continue;
      const inviter = await ctx.db.get(row.inviterId);
      enriched.push({
        invite: row,
        event: ev,
        inviter: inviter
          ? { _id: inviter._id, name: inviter.name }
          : null,
      });
    }
    enriched.sort((a, b) => {
      const aStart = a.event?.startsAt ?? Infinity;
      const bStart = b.event?.startsAt ?? Infinity;
      return aStart - bStart;
    });
    return enriched;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal variants
// ─────────────────────────────────────────────────────────────────────────────

// RSVP summary for an event, scoped to a particular asker. Returns
// aggregate counts always; the full attendee roster is only exposed when
// the asker is the creator OR has at least one invite on the event
// (matches the product-level visibility of `listInvitesForEvent`).
export const getRsvpSummaryInternal = internalQuery({
  args: {
    askerId: v.id("users"),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const ownInvite = await getInviteForPair(ctx, args.eventId, args.askerId);
    const isCreator = event.createdBy === args.askerId;
    if (!isCreator && !ownInvite) return null; // not authorized to read

    const rows = await ctx.db
      .query("eventInvites")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const counts = {
      total: rows.length,
      accepted: 0,
      declined: 0,
      maybe: 0,
      pending: 0,
    };
    for (const r of rows) counts[r.status] += 1;

    // Preview roster: top 6 accepted attendees (+ the rest as name-only
    // fallback). Creator sees all statuses; invitees see only accepted
    // previews to mirror the detail-page UX.
    const previewRows = isCreator
      ? rows
      : rows.filter((r) => r.status === "accepted");
    const previewCap = 6;
    const sliced = previewRows.slice(0, previewCap);
    const attendees: Array<{
      userId: Id<"users">;
      name: string;
      username: string | null;
      avatar: string | null;
      status: "pending" | "accepted" | "declined" | "maybe";
    }> = [];
    for (const r of sliced) {
      const u = await ctx.db.get(r.inviteeId);
      if (!u) continue;
      attendees.push({
        userId: u._id,
        name: u.name,
        username: u.username ?? null,
        avatar: u.avatar ?? null,
        status: r.status,
      });
    }

    return {
      event: {
        _id: event._id,
        name: event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? null,
        locationName: event.locationName ?? null,
        status: event.status,
      },
      isCreator,
      myRsvp: ownInvite?.status ?? null,
      counts,
      attendees,
    };
  },
});

// Internal variant of `inviteToEvent` callable from internal actions (e.g.
// the groupChatAgent scheduleEvent skill auto-inviting every group
// member). The inviter is the event creator by design — pass it so the
// notifier can populate a meaningful `creatorName` without re-querying.
export const inviteInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    inviterId: v.id("users"),
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const inviter = await ctx.db.get(args.inviterId);
    const inviterName = inviter?.name ?? "Someone";
    for (const userId of args.userIds) {
      if (userId === args.inviterId) continue;
      const existing = await getInviteForPair(ctx, args.eventId, userId);
      if (existing) continue;
      const inviteId = await ctx.db.insert("eventInvites", {
        eventId: args.eventId,
        inviterId: args.inviterId,
        inviteeId: userId,
        status: "pending",
        createdAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId,
          type: "event_invite",
          title: `${inviterName} invited you to ${event.name}`,
          body: event.description ?? undefined,
          link: `/dashboard/events/${args.eventId}`,
          meta: { eventId: args.eventId, inviteId },
        },
      );
    }
  },
});
