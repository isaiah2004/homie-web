import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
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
  // Lobby members can always read the event doc — without this widening,
  // a non-friend who joined the lobby via a share link would crash on
  // /dashboard/events/{id}/lobby because `getEventForViewer` would 404.
  const lobbyMembership = await ctx.db
    .query("eventRoomMembers")
    .withIndex("by_event_and_user", (q) =>
      q.eq("eventId", event._id).eq("userId", viewerId),
    )
    .unique();
  if (lobbyMembership) return true;
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
    // Optional community tie-in. Caller must be a member of the
    // community to attach an event to it — prevents a drive-by
    // non-member from spamming a community's calendar.
    communityId: v.optional(v.id("communities")),
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
    if (args.communityId) {
      const membership = await ctx.db
        .query("communityMembers")
        .withIndex("by_community_and_user", (q) =>
          q
            .eq("communityId", args.communityId!)
            .eq("userId", viewerId),
        )
        .unique();
      if (!membership) {
        throw new Error(
          "You must be a community member to post an event there",
        );
      }
    }
    const now = Date.now();
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
      communityId: args.communityId,
      status: "scheduled",
      createdAt: now,
      roomEnabled: true,
      roomMemberCount: 1,
    });
    // Seed the creator as the lobby host so they don't have to join their
    // own event.
    await ctx.db.insert("eventRoomMembers", {
      eventId: id,
      userId: viewerId,
      role: "host",
      joinedAt: now,
      lastReadAt: now,
    });
    return id;
  },
});

// Edit an event. Creator-only. Supports patching every metadata field
// plus the invitee roster in a single call.
//
// Side effects:
//   - `startsAt` change → notify every non-pending invitee AND reset
//     everyone's RSVP to "pending" (they should re-confirm for the new
//     time). Also stamps `editedAt`.
//   - `endsAt` or venue (locationName/Address/MapsLink) change → notify
//     current RSVPers ("details updated"). RSVPs are preserved.
//   - `inviteeIds` → diffs against current invites. New users get a
//     pending invite + `event_invite` notification; removed users have
//     their invite row deleted (silently — no "you were uninvited"
//     notification).
//   - Always stamps `editedAt` when any patchable field is present.
export const updateEvent = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      startsAt: v.optional(v.number()),
      endsAt: v.optional(v.union(v.number(), v.null())),
      locationName: v.optional(v.union(v.string(), v.null())),
      locationAddress: v.optional(v.union(v.string(), v.null())),
      locationMapsLink: v.optional(v.union(v.string(), v.null())),
      locationLat: v.optional(v.union(v.number(), v.null())),
      locationLng: v.optional(v.union(v.number(), v.null())),
      visibility: v.optional(
        v.union(
          v.literal("public"),
          v.literal("friends"),
          v.literal("invitees"),
        ),
      ),
      coverImageUrl: v.optional(v.union(v.string(), v.null())),
    }),
    // When present, replaces the invitee list. undefined → no change.
    // Items already invited stay as-is (status preserved); items dropped
    // from the list are uninvited.
    inviteeIds: v.optional(v.array(v.id("users"))),
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
    // `null` in the patch means "clear the value". `undefined` means "no
    // change". Normalize to the shape ctx.db.patch expects.
    const rawEnd = args.patch.endsAt;
    const nextEnd =
      rawEnd === undefined
        ? event.endsAt
        : rawEnd === null
          ? undefined
          : rawEnd;
    if (
      nextEnd !== undefined &&
      Number.isFinite(nextEnd) &&
      nextEnd < nextStart
    ) {
      throw new Error("endsAt cannot be before startsAt");
    }

    // Build the ctx.db.patch payload. Convert any nulls to `undefined`
    // because Convex's optional-field semantics use `undefined` to clear.
    type EventPatch = {
      name?: string;
      description?: string;
      startsAt?: number;
      endsAt?: number;
      locationName?: string;
      locationAddress?: string;
      locationMapsLink?: string;
      locationLat?: number;
      locationLng?: number;
      visibility?: "public" | "friends" | "invitees";
      coverImageUrl?: string;
      editedAt?: number;
    };
    const patch: EventPatch = {};
    if (newName !== undefined) patch.name = newName;
    if (args.patch.description !== undefined) {
      patch.description = args.patch.description;
    }
    if (args.patch.startsAt !== undefined) patch.startsAt = args.patch.startsAt;
    if (rawEnd !== undefined) patch.endsAt = rawEnd === null ? undefined : rawEnd;
    if (args.patch.locationName !== undefined) {
      patch.locationName =
        args.patch.locationName === null ? undefined : args.patch.locationName;
    }
    if (args.patch.locationAddress !== undefined) {
      patch.locationAddress =
        args.patch.locationAddress === null
          ? undefined
          : args.patch.locationAddress;
    }
    if (args.patch.locationMapsLink !== undefined) {
      patch.locationMapsLink =
        args.patch.locationMapsLink === null
          ? undefined
          : args.patch.locationMapsLink;
    }
    if (args.patch.locationLat !== undefined) {
      patch.locationLat =
        args.patch.locationLat === null ? undefined : args.patch.locationLat;
    }
    if (args.patch.locationLng !== undefined) {
      patch.locationLng =
        args.patch.locationLng === null ? undefined : args.patch.locationLng;
    }
    if (args.patch.visibility !== undefined) {
      patch.visibility = args.patch.visibility;
    }
    if (args.patch.coverImageUrl !== undefined) {
      patch.coverImageUrl =
        args.patch.coverImageUrl === null
          ? undefined
          : args.patch.coverImageUrl;
    }

    const hasPatchedFields = Object.keys(patch).length > 0;
    if (hasPatchedFields) {
      patch.editedAt = Date.now();
      await ctx.db.patch(args.eventId, patch);
    }

    // Detect which kinds of notify-worthy changes happened.
    const startChanged =
      args.patch.startsAt !== undefined &&
      args.patch.startsAt !== event.startsAt;
    const endChanged =
      rawEnd !== undefined &&
      (rawEnd === null ? event.endsAt !== undefined : rawEnd !== event.endsAt);
    const venueChanged =
      (args.patch.locationName !== undefined &&
        (args.patch.locationName ?? undefined) !==
          (event.locationName ?? undefined)) ||
      (args.patch.locationAddress !== undefined &&
        (args.patch.locationAddress ?? undefined) !==
          (event.locationAddress ?? undefined)) ||
      (args.patch.locationMapsLink !== undefined &&
        (args.patch.locationMapsLink ?? undefined) !==
          (event.locationMapsLink ?? undefined));

    const displayName = newName ?? event.name;

    // Notify non-pending invitees when startsAt / endsAt / venue changes.
    // We fire a single notification per invitee regardless of how many
    // things changed — chattier notifications are worse than one focused
    // update the user can open to see all the changes at once.
    if (startChanged || endChanged || venueChanged) {
      const invites = await ctx.db
        .query("eventInvites")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      const body = startChanged
        ? "The start time has been updated — please reconfirm your RSVP."
        : venueChanged
          ? "The venue has been updated."
          : "The end time has been updated.";
      for (const invite of invites) {
        if (invite.status === "pending") continue;
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.createNotification,
          {
            userId: invite.inviteeId,
            type: "event_updated",
            title: `Updated: ${displayName}`,
            body,
            link: `/dashboard/events/${args.eventId}`,
            meta: { eventId: args.eventId },
          },
        );
      }

      // RSVP reset on startsAt change — non-pending invitees are flipped
      // back to pending so they re-confirm for the new time.
      if (startChanged) {
        for (const invite of invites) {
          if (invite.status === "pending") continue;
          await ctx.db.patch(invite._id, {
            status: "pending",
            respondedAt: undefined,
          });
        }
      }
    }

    // Diff + apply the invitee list, if the caller provided one.
    if (args.inviteeIds !== undefined) {
      const desired = new Set<string>(args.inviteeIds.map((id) => id as string));
      desired.delete(viewerId as string); // can't invite yourself
      const current = await ctx.db
        .query("eventInvites")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      const currentIds = new Set<string>(
        current.map((r) => r.inviteeId as string),
      );
      // Remove invites the caller dropped from the list.
      for (const row of current) {
        if (!desired.has(row.inviteeId as string)) {
          await ctx.db.delete(row._id);
        }
      }
      // Add invites for new users + notify.
      const creator = await ctx.db.get(viewerId);
      const creatorName = creator?.name ?? "Someone";
      for (const idStr of desired) {
        if (currentIds.has(idStr)) continue;
        const userId = idStr as Id<"users">;
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
            title: `${creatorName} invited you to ${displayName}`,
            body: event.description ?? undefined,
            link: `/dashboard/events/${args.eventId}`,
            meta: { eventId: args.eventId, inviteId },
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
    await ctx.db.patch(args.eventId, {
      status: "cancelled",
      roomEnabled: false,
    });

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

// Every event attached to a community, sorted by `startsAt`. Member-only
// — non-members never see the events tab. Uses the
// `by_community_and_startsAt` index so pagination by start time is
// cheap.
export const listEventsForCommunity = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const membership = await ctx.db
      .query("communityMembers")
      .withIndex("by_community_and_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", viewerId),
      )
      .unique();
    if (!membership) throw new Error("Not a community member");

    const rows = await ctx.db
      .query("events")
      .withIndex("by_community_and_startsAt", (q) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .take(200);
    return rows.map((event) => ({
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

// Upcoming events for a user (created OR invited), within `withinDays` from
// now (default 60). Skips cancelled events. Sorted ascending by startsAt so
// the soonest is first. Used by the `listMyUpcomingEvents` chat tool.
export const listUpcomingForUserInternal = internalQuery({
  args: {
    askerId: v.id("users"),
    withinDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = Math.min(args.withinDays ?? 60, 365) * 24 * 60 * 60 * 1000;
    const cutoff = now + windowMs;

    const mine = await ctx.db
      .query("events")
      .withIndex("by_creator", (q) => q.eq("createdBy", args.askerId))
      .collect();
    const invitedRows = await ctx.db
      .query("eventInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", args.askerId))
      .collect();
    const invitedEvents: Doc<"events">[] = [];
    const seen = new Set<string>(mine.map((e) => e._id as string));
    for (const row of invitedRows) {
      if (seen.has(row.eventId as string)) continue;
      const ev = await ctx.db.get(row.eventId);
      if (!ev) continue;
      seen.add(ev._id as string);
      invitedEvents.push(ev);
    }
    const all = [...mine, ...invitedEvents]
      .filter(
        (e) =>
          e.status !== "cancelled" &&
          e.startsAt >= now - 60 * 60 * 1000 && // small grace for in-progress
          e.startsAt <= cutoff,
      )
      .sort((a, b) => a.startsAt - b.startsAt);

    return all.map((event) => ({
      event,
      isMine: event.createdBy === args.askerId,
    }));
  },
});

// Internal variant of `createEvent` callable from internal actions (e.g.
// the groupChatAgent scheduleEvent skill). Takes `creatorId` explicitly
// because actions don't have `ctx.auth` scoped to a specific Clerk user
// — the caller is responsible for having already authorized the creator.
export const createEventInternal = internalMutation({
  args: {
    creatorId: v.id("users"),
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
    groupChatRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
    const now = Date.now();
    const id = await ctx.db.insert("events", {
      createdBy: args.creatorId,
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
      groupChatRef: args.groupChatRef,
      status: "scheduled",
      createdAt: now,
      roomEnabled: true,
      roomMemberCount: 1,
    });
    await ctx.db.insert("eventRoomMembers", {
      eventId: id,
      userId: args.creatorId,
      role: "host",
      joinedAt: now,
      lastReadAt: now,
    });
    return id;
  },
});
