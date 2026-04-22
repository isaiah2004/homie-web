import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { classifyMime } from "./lib/mime"

// Finalize an R2 upload by inserting (or reusing) an `attachments` row.
// Called by the client after the presigned PUT succeeds. Re-validates
// size/type because mutations are the trust boundary — the action can
// only be trusted to mint a URL, not to enforce ownership.
export const finalizeUpload = mutation({
  args: {
    userId: v.id("users"),
    key: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const mime = classifyMime(args.contentType)
    if (!mime) throw new Error("Unsupported file type")
    if (args.size > mime.maxSize) throw new Error("File too large")
    const publicUrl = process.env.R2_PUBLIC_BASE_URL
      ? `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${args.key}`
      : ""
    // Idempotent — if the key is already finalized, return the existing id.
    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()
    if (existing) return existing._id
    return await ctx.db.insert("attachments", {
      userId: args.userId,
      key: args.key,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      publicUrl,
      kind: mime.kind,
      width: args.width,
      height: args.height,
      createdAt: Date.now(),
    })
  },
})

// Hydrate attachment rows for a set of ids (typically the union of
// `attachmentIds` across messages currently in view). Returns `null` for
// missing rows so the UI can keep indices aligned.
export const getMany = query({
  args: { ids: v.array(v.id("attachments")) },
  handler: async (ctx, { ids }) => {
    return await Promise.all(ids.map((id) => ctx.db.get(id)))
  },
})

// List a user's recent uploads — useful for a "pick from library" UI.
export const listForUser = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    return await ctx.db
      .query("attachments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 50)
  },
})
