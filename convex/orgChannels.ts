import { v } from "convex/values"
import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import { getCallerUserId } from "./_lib/authz"

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

async function getBusinessMembership(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
): Promise<Doc<"businessMembers"> | null> {
  return await ctx.db
    .query("businessMembers")
    .withIndex("by_business_and_user", (q) =>
      q.eq("businessId", businessId).eq("userId", userId),
    )
    .unique()
}

async function getChannelMembership(
  ctx: QueryCtx | MutationCtx,
  channelId: Id<"orgChannels">,
  userId: Id<"users">,
): Promise<Doc<"orgChannelMembers"> | null> {
  return await ctx.db
    .query("orgChannelMembers")
    .withIndex("by_channel_and_user", (q) =>
      q.eq("channelId", channelId).eq("userId", userId),
    )
    .unique()
}

// Channel access requires an `orgChannelMembers` row. Business membership
// alone isn't enough — this leaves room for a future private channel that
// only admins see without changing this call site.
async function assertChannelAccess(
  ctx: QueryCtx | MutationCtx,
  channelId: Id<"orgChannels">,
  userId: Id<"users">,
): Promise<Doc<"orgChannels">> {
  const channel = await ctx.db.get(channelId)
  if (!channel) throw new Error("Channel not found")
  const membership = await getChannelMembership(ctx, channelId, userId)
  if (!membership) throw new Error("Not a channel member")
  return channel
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// List channels under a business. Business-member-gated; non-members get
// an error so the UI can render a fallback instead of an empty list.
export const listChannels = query({
  args: {
    devUserId: v.optional(v.id("users")),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const me = await getBusinessMembership(ctx, args.businessId, callerId)
    if (!me) throw new Error("Not a business member")

    const channels = await ctx.db
      .query("orgChannels")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect()

    // Order by creation time — the auto-created "general" is always oldest.
    channels.sort((a, b) => a.createdAt - b.createdAt)
    return channels
  },
})

// Channel message history. Channel-member-gated. Oldest-first so the UI
// can `scrollIntoView` the tail after mount.
export const listMessages = query({
  args: {
    devUserId: v.optional(v.id("users")),
    channelId: v.id("orgChannels"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await assertChannelAccess(ctx, args.channelId, callerId)

    const cap = Math.min(args.limit ?? 200, 500)
    return await ctx.db
      .query("orgChannelMessages")
      .withIndex("by_channel_and_sentAt", (q) =>
        q.eq("channelId", args.channelId),
      )
      .order("asc")
      .take(cap)
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Send a message to a channel. Caller must be a channel member; attachment
// ownership is validated so a member can't reference someone else's R2 row.
export const sendMessage = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    channelId: v.id("orgChannels"),
    content: v.string(),
    format: v.union(v.literal("text"), v.literal("markdown")),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await assertChannelAccess(ctx, args.channelId, callerId)

    const content = args.content.trim()
    const hasAttachments = (args.attachmentIds?.length ?? 0) > 0
    if (content.length === 0 && !hasAttachments) {
      throw new Error("Message cannot be empty")
    }

    if (args.attachmentIds && args.attachmentIds.length > 0) {
      for (const aid of args.attachmentIds) {
        const attachment = await ctx.db.get(aid)
        if (!attachment) throw new Error("Attachment not found")
        if (attachment.userId !== callerId) {
          throw new Error("Cannot attach someone else's file")
        }
      }
    }

    const messageId = await ctx.db.insert("orgChannelMessages", {
      channelId: args.channelId,
      from: callerId,
      content,
      format: args.format,
      attachmentIds: args.attachmentIds,
      sentAt: Date.now(),
    })
    return messageId
  },
})
