import { v } from "convex/values"
import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import {
  getCallerUserId,
  requireCommunityRole,
} from "./_lib/authz"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId })
  return await getCallerUserId(ctx, { email: identity.email })
}

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers"> | null> {
  return await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_user", (q) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .unique()
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Post an announcement. Requires role >= announcer. Notifies every
// community member (except the author) with `community_announcement`.
// Body is raw markdown — sanitization happens on the client via
// react-markdown + rehype-sanitize (we avoid DOMPurify on the server
// per the PR constraints).
export const postAnnouncement = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    title: v.string(),
    body: v.string(),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(
      ctx,
      callerId,
      args.communityId,
      "announcer",
    )

    const title = args.title.trim()
    if (title.length < 2) throw new Error("Title is too short")
    const body = args.body.trim()
    if (body.length === 0) throw new Error("Body is required")
    if (body.length > 20_000) throw new Error("Body is too long")

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")

    const now = Date.now()
    const announcementId = await ctx.db.insert("communityAnnouncements", {
      communityId: args.communityId,
      authorId: callerId,
      title,
      body,
      pinned: args.pinned ?? false,
      createdAt: now,
    })

    // Fan-out notifications. Members fetched from the roster; scheduled
    // out-of-band so a slow notification write can't roll back the post.
    const members = await ctx.db
      .query("communityMembers")
      .withIndex("by_community", (q) =>
        q.eq("communityId", args.communityId),
      )
      .collect()
    for (const m of members) {
      if (m.userId === callerId) continue
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.createNotification,
        {
          userId: m.userId,
          type: "community_announcement",
          title: `${community.name}: ${title}`,
          body: undefined,
          link: `/dashboard/communities/${community.slug}`,
          meta: {
            communityId: args.communityId,
            announcementId,
          },
        },
      )
    }

    return announcementId
  },
})

// Delete an announcement. Admin OR author. Members cannot delete
// someone else's post.
export const deleteAnnouncement = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    announcementId: v.id("communityAnnouncements"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const announcement = await ctx.db.get(args.announcementId)
    if (!announcement) throw new Error("Announcement not found")

    if (announcement.authorId !== callerId) {
      await requireCommunityRole(
        ctx,
        callerId,
        announcement.communityId,
        "admin",
      )
    }

    await ctx.db.delete(args.announcementId)
  },
})

// Toggle the pinned flag on an announcement. Moderator+. Used by the
// pin icon on the feed; flip idempotent.
export const togglePin = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    announcementId: v.id("communityAnnouncements"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const announcement = await ctx.db.get(args.announcementId)
    if (!announcement) throw new Error("Announcement not found")
    await requireCommunityRole(
      ctx,
      callerId,
      announcement.communityId,
      "moderator",
    )

    await ctx.db.patch(args.announcementId, {
      pinned: !announcement.pinned,
    })
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Feed of announcements, member-only. Pinned first (most-recently-pinned
// at the top), then chronological for the rest.
export const listAnnouncements = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const m = await getMembership(ctx, args.communityId, callerId)
    if (!m) throw new Error("Not a community member")

    const rows = await ctx.db
      .query("communityAnnouncements")
      .withIndex("by_community_and_created", (q) =>
        q.eq("communityId", args.communityId),
      )
      .order("desc")
      .take(100)

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const author = await ctx.db.get(r.authorId)
        return {
          announcement: r,
          author: author
            ? {
                _id: author._id,
                name: author.name,
                username: author.username,
              }
            : null,
        }
      }),
    )

    // Pinned posts first, tiebreak on createdAt desc.
    enriched.sort((a, b) => {
      if (a.announcement.pinned !== b.announcement.pinned) {
        return a.announcement.pinned ? -1 : 1
      }
      return b.announcement.createdAt - a.announcement.createdAt
    })
    return enriched
  },
})
