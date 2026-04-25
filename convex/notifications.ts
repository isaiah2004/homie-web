import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// All public queries/mutations in this file gate on `resolveIdentity` and
// then resolve to the caller's users row. Mirrors the pattern used in
// `convex/attachments.ts` — never trust a client-supplied userId.
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

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// List notifications for the caller, newest first. `onlyUnread` limits the
// feed to unread rows (used by the popover + badge).
export const listNotifications = query({
  args: {
    devUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    onlyUnread: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const cap = Math.min(args.limit ?? 50, 200);
    if (args.onlyUnread) {
      const rows = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_read", (q) =>
          q.eq("userId", viewerId).eq("read", false),
        )
        .order("desc")
        .take(cap);
      return rows;
    }
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_createdAt", (q) => q.eq("userId", viewerId))
      .order("desc")
      .take(cap);
    return rows;
  },
});

// Cheap unread counter for the bell badge. Caps at 200 (the bell just shows
// "99+" anyway) to avoid pathological scans when a user has been offline for
// a long time.
export const unreadCount = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", viewerId).eq("read", false),
      )
      .take(200);
    return rows.length;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Mark a specific set of notifications as read. Silently skips any id that
// either doesn't exist or isn't owned by the caller — prevents a cross-user
// write without leaking existence.
export const markRead = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    notificationIds: v.array(v.id("notifications")),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    for (const id of args.notificationIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      if (row.userId !== viewerId) continue;
      if (row.read) continue;
      await ctx.db.patch(id, { read: true });
    }
  },
});

// Mark every unread notification owned by the caller as read.
export const markAllRead = mutation({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    // Process in batches to stay within transaction limits. 200 per call is
    // well under Convex's default document-read cap and matches unreadCount.
    const batch: Doc<"notifications">[] = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", viewerId).eq("read", false),
      )
      .take(200);
    for (const row of batch) {
      await ctx.db.patch(row._id, { read: true });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal — shared entry point used by other Convex modules to enqueue a
// notification. Scheduled via `ctx.scheduler.runAfter(0, ...)` from mutations
// so the transaction that triggered it isn't coupled to notification write
// failures.
// ─────────────────────────────────────────────────────────────────────────────

export const createNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("event_invite"),
      v.literal("event_accepted"),
      v.literal("event_declined"),
      v.literal("event_cancelled"),
      v.literal("event_updated"),
      v.literal("community_join_request"),
      v.literal("community_request_accepted"),
      v.literal("community_request_declined"),
      v.literal("community_announcement"),
      v.literal("community_role_changed"),
      v.literal("community_removed"),
      v.literal("community_invite"),
      v.literal("business_member_invite"),
      v.literal("business_role_changed"),
      v.literal("ad_approved"),
      v.literal("ad_rejected"),
      v.literal("parent_invite"),
      v.literal("parent_invite_accepted"),
      v.literal("spouse_invite"),
      v.literal("spouse_invite_accepted"),
      v.literal("parent_approval_needed"),
      v.literal("parent_approval_granted"),
      v.literal("parent_approval_denied"),
      v.literal("child_settings_changed"),
      v.literal("groupchat_age_distribution_flagged"),
    ),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
    meta: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      link: args.link,
      meta: args.meta,
      read: false,
      createdAt: Date.now(),
    });
  },
});
