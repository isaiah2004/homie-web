import { v } from "convex/values"
import {
  query,
  mutation,
  internalQuery,
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
// `format` defaults to "markdown" for backwards compatibility; the rich
// TipTap composer sends "html" and uploads any attached files to R2 via
// `api.r2.generateUploadUrl` (same pipeline as DM attachments). The
// client sanitizes HTML both pre-send (TipTap's constrained schema) and
// pre-render (DOMPurify in message-content); we don't run DOMPurify on
// the server because isomorphic-dompurify doesn't initialize inside the
// Convex V8 isolate — mirrors the `dm.sendMessage` comment.
export const postAnnouncement = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    title: v.string(),
    body: v.string(),
    format: v.optional(
      v.union(v.literal("markdown"), v.literal("html")),
    ),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          contentType: v.string(),
          name: v.string(),
          size: v.number(),
        }),
      ),
    ),
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
    // HTML bodies from TipTap may contain an empty `<p></p>` wrapper even
    // when visually blank. Allow the post when at least one attachment is
    // present — same rule as the DM composer's "attachment-only" message.
    const hasAttachments =
      args.attachments !== undefined && args.attachments.length > 0
    if (body.length === 0 && !hasAttachments) {
      throw new Error("Body or an attachment is required")
    }
    if (body.length > 20_000) throw new Error("Body is too long")
    if (args.attachments && args.attachments.length > 10) {
      throw new Error("At most 10 attachments per announcement")
    }

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")

    const now = Date.now()
    const announcementId = await ctx.db.insert("communityAnnouncements", {
      communityId: args.communityId,
      authorId: callerId,
      title,
      body,
      format: args.format,
      attachments: args.attachments,
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

// Edit an announcement. Author OR community admin. Sets `editedAt` to
// Date.now() so the UI can render a "· edited" marker next to the
// timestamp. Title + body are both optional — a caller can patch one
// without the other (though the UI always sends both today).
export const updateAnnouncement = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    announcementId: v.id("communityAnnouncements"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const announcement = await ctx.db.get(args.announcementId)
    if (!announcement) throw new Error("Announcement not found")

    if (announcement.authorId !== callerId) {
      // Non-authors must be community admins to edit.
      await requireCommunityRole(
        ctx,
        callerId,
        announcement.communityId,
        "admin",
      )
    }

    const patch: {
      title?: string
      body?: string
      editedAt: number
    } = { editedAt: Date.now() }

    if (args.title !== undefined) {
      const title = args.title.trim()
      if (title.length < 2) throw new Error("Title is too short")
      patch.title = title
    }
    if (args.body !== undefined) {
      const body = args.body.trim()
      if (body.length === 0) throw new Error("Body is required")
      if (body.length > 20_000) throw new Error("Body is too long")
      patch.body = body
    }

    await ctx.db.patch(args.announcementId, patch)
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

// Recent announcements across every community the asker is a member of,
// optionally scoped to a single community. Sorted newest-first. Used by
// the chat `listRecentAnnouncements` tool.
export const listRecentForUserInternal = internalQuery({
  args: {
    askerId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit ?? 8, 25)

    let candidates: Doc<"communityAnnouncements">[]
    let communityIds: Id<"communities">[]

    if (args.communityId) {
      // Enforce membership before exposing rows.
      const m = await ctx.db
        .query("communityMembers")
        .withIndex("by_community_and_user", (q) =>
          q.eq("communityId", args.communityId!).eq("userId", args.askerId),
        )
        .unique()
      if (!m) return []
      communityIds = [args.communityId]
      candidates = await ctx.db
        .query("communityAnnouncements")
        .withIndex("by_community_and_created", (q) =>
          q.eq("communityId", args.communityId!),
        )
        .order("desc")
        .take(cap * 2)
    } else {
      const memberships = await ctx.db
        .query("communityMembers")
        .withIndex("by_user", (q) => q.eq("userId", args.askerId))
        .collect()
      communityIds = memberships.map((m) => m.communityId)
      const collected: Doc<"communityAnnouncements">[] = []
      for (const cid of communityIds) {
        const rows = await ctx.db
          .query("communityAnnouncements")
          .withIndex("by_community_and_created", (q) =>
            q.eq("communityId", cid),
          )
          .order("desc")
          .take(cap)
        collected.push(...rows)
      }
      candidates = collected
    }

    candidates.sort((a, b) => b.createdAt - a.createdAt)
    const sliced = candidates.slice(0, cap)

    const communityLookup = new Map<string, Doc<"communities">>()
    for (const cid of communityIds) {
      const c = await ctx.db.get(cid)
      if (c) communityLookup.set(cid as string, c)
    }

    const enriched: Array<{
      announcement: Doc<"communityAnnouncements">
      community: {
        _id: Id<"communities">
        name: string
        slug: string
      }
      author: { name: string; username: string | null } | null
    }> = []
    for (const r of sliced) {
      const community = communityLookup.get(r.communityId as string)
      if (!community) continue
      const author = await ctx.db.get(r.authorId)
      enriched.push({
        announcement: r,
        community: {
          _id: community._id,
          name: community.name,
          slug: community.slug,
        },
        author: author
          ? { name: author.name, username: author.username ?? null }
          : null,
      })
    }
    return enriched
  },
})
