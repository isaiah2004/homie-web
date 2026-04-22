import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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

async function isAcceptedFriend(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  viewerId: Id<"users">,
): Promise<boolean> {
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", ownerId).eq("friendId", viewerId),
    )
    .unique();
  return edge?.status === "accepted";
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

// Resolves whether `viewerId` may see `event` given its visibility setting.
// Returns `true` if visible. Used by `getEventForViewer` and list queries
// that need the same gate applied to each row.
async function canViewEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
  viewerId: Id<"users">,
): Promise<boolean> {
  if (event.createdBy === viewerId) return true;
  if (event.visibility === "public") return true;
  if (event.visibility === "friends") {
    return await isAcceptedFriend(ctx, event.createdBy, viewerId);
  }
  // "invitees" — require a matching invite row (any status, including
  // declined, so declined invitees can still see the page).
  const invite = await getInviteForPair(ctx, event._id, viewerId);
  return invite !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export const createEvent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    name: v.string(),
    description: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    locationName: v.optional(v.string()),
    locationAddress: v.optional(v.string()),
    locationMapsLink: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    visibility: v.union(
      v.literal("public"),
      v.literal("friends"),
      v.literal("invitees"),
    ),
    coverImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const name = args.name.trim();
    if (name.length < 2) throw new Error("Event name is too short");
    if (!Number.isFinite(args.startsAt)) {
      throw new Error("Invalid startsAt");
    }
    if (
      args.endsAt !== undefined &&
      Number.isFinite(args.endsAt) &&
      args.endsAt < args.startsAt
    ) {
      throw new Error("endsAt cannot be before startsAt");
    }
    const id = await ctx.db.insert("events", {
      createdBy: viewerId,
      name,
      description: args.description,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      locationName: args.locationName,
      locationAddress: args.locationAddress,
      locationMapsLink: args.locationMapsLink,
      locationLat: args.locationLat,
      locationLng: args.locationLng,
      visibility: args.visibility,
      coverImageUrl: args.coverImageUrl,
      status: "scheduled",
      createdAt: Date.now(),
    });
    return id;
  },
});

export const updateEvent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      startsAt: v.optional(v.number()),
      endsAt: v.optional(v.number()),
      locationName: v.optional(v.string()),
      locationAddress: v.optional(v.string()),
      locationMapsLink: v.optional(v.string()),
      locationLat: v.optional(v.number()),
      locationLng: v.optional(v.number()),
      visibility: v.optional(
        v.union(
          v.literal("public"),
          v.literal("friends"),
          v.literal("invitees"),
        ),
      ),
      coverImageUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.createdBy !== viewerId) {
      throw new Error("Only the creator can edit this event");
    }

    const newName = args.patch.name?.trim();
    if (newName !== undefined && newName.length < 2) {
      throw new Error("Event name is too short");
    }

    const nextStart = args.patch.startsAt ?? event.startsAt;
    const nextEnd = args.patch.endsAt ?? event.endsAt;
    if (
      nextEnd !== undefined &&
      Number.isFinite(nextEnd) &&
      nextEnd < nextStart
    ) {
      throw new Error("endsAt cannot be before startsAt");
    }

    const patch = { ...args.patch };
    if (newName !== undefined) patch.name = newName;
    await ctx.db.patch(args.eventId, patch);

    // Notify accepted invitees if the start time changed. Declined/maybe
    // invitees also care about the new time, so notify them too — only
    // `pending` folks who haven't engaged yet are omitted.
    if (
      args.patch.startsAt !== undefined &&
      args.patch.startsAt !== event.startsAt
    ) {
      const accepted = await ctx.db
        .query("eventInvites")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      for (const invite of accepted) {
        if (invite.status === "pending") continue;
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.createNotification,
          {
            userId: invite.inviteeId,
            type: "event_updated",
            title: `Time changed: ${newName ?? event.name}`,
            body: "The start time has been updated.",
            link: `/dashboard/events/${args.eventId}`,
            meta: { eventId: args.eventId },
          },
        );
      }
    }
  },
});

export const cancelEvent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.createdBy !== viewerId) {
      throw new Error("Only the creator can cancel this event");
    }
    if (event.status === "cancelled") return;
    await ctx.db.patch(args.eventId, { status: "cancelled" });

    const invites = await ctx.db
      .query("eventInvites")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const invite of invites) {
      if (
        invite.status !== "pending" &&
        invite.status !== "accepted" &&
        invite.status !== "maybe"
      ) {
        continue;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId: invite.inviteeId,
          type: "event_cancelled",
          title: `Cancelled: ${event.name}`,
          body: "This event has been cancelled by the creator.",
          link: `/dashboard/events/${args.eventId}`,
          meta: { eventId: args.eventId },
        },
      );
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Returns the event doc if the caller is allowed to see it, else null.
// Also returns the viewer's current invite (if any) and whether they are
// the creator, so the detail page can render the right CTA set without
// extra round-trips.
export const getEventForViewer = query({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const visible = await canViewEvent(ctx, event, viewerId);
    if (!visible) return null;
    const invite = await getInviteForPair(ctx, event._id, viewerId);
    const creator = await ctx.db.get(event.createdBy);
    return {
      event,
      invite,
      isCreator: event.createdBy === viewerId,
      creator: creator
        ? {
            _id: creator._id,
            name: creator.name,
            username: creator.username,
          }
        : null,
    };
  },
});

// Events the viewer either created or was invited to. Sorted ascending by
// startsAt so upcoming events come first.
export const listMyEvents = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const mine = await ctx.db
      .query("events")
      .withIndex("by_creator", (q) => q.eq("createdBy", viewerId))
      .collect();
    const invitedRows = await ctx.db
      .query("eventInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", viewerId))
      .collect();
    const invitedEvents: Doc<"events">[] = [];
    const seen = new Set<string>(mine.map((e) => e._id));
    for (const row of invitedRows) {
      if (seen.has(row.eventId)) continue;
      const ev = await ctx.db.get(row.eventId);
      if (!ev) continue;
      seen.add(ev._id);
      invitedEvents.push(ev);
    }
    const all = [...mine, ...invitedEvents].sort(
      (a, b) => a.startsAt - b.startsAt,
    );
    return all.map((event) => ({
      event,
      isMine: event.createdBy === viewerId,
    }));
  },
});

// Range-bounded query for the calendar view. Returns every event the viewer
// can see whose `startsAt` falls in [from, to).
export const listEventsForCalendar = query({
  args: {
    devUserId: v.optional(v.id("users")),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const rows = await ctx.db
      .query("events")
      .withIndex("by_startsAt", (q) =>
        q.gte("startsAt", args.from).lt("startsAt", args.to),
      )
      .take(500);
    const visible: Array<{ event: Doc<"events">; isMine: boolean }> = [];
    for (const ev of rows) {
      const ok = await canViewEvent(ctx, ev, viewerId);
      if (!ok) continue;
      visible.push({ event: ev, isMine: ev.createdBy === viewerId });
    }
    return visible;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (used by notifications and cross-file callers).
// ─────────────────────────────────────────────────────────────────────────────

export const getEventInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db.get(eventId);
  },
});
