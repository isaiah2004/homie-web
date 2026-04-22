import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { classifyMime } from "./lib/mime"
import { resolveIdentity } from "./lib/identity"

// Finalize an R2 upload by inserting (or reusing) an `attachments` row.
// Called by the client after the presigned PUT succeeds. Re-validates
// size/type because mutations are the trust boundary — the action can
// only be trusted to mint a URL, not to enforce ownership.
//
// Auth: `resolveIdentity` returns the authenticated user's identity (prod
// Clerk or dev switcher). We look up the users row by email and use THAT
// id as the attachment's owner — never a client-supplied value. This
// matches the key prefix chosen in `convex/r2.ts::generateUploadUrl`, so
// an attacker can't call finalize with a victim's userId.
export const finalizeUpload = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    key: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await resolveIdentity(ctx, {
      devUserId: args.devUserId,
    })
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique()
    if (!user) throw new Error("User not found for identity")
    const userId = user._id

    const mime = classifyMime(args.contentType)
    if (!mime) throw new Error("Unsupported file type")
    if (args.size > mime.maxSize) throw new Error("File too large")

    // Fail fast if R2_PUBLIC_BASE_URL is unset — otherwise we'd insert a
    // row with an empty publicUrl that the UI renders as a broken <img>.
    const baseUrl = process.env.R2_PUBLIC_BASE_URL
    if (!baseUrl) {
      throw new Error(
        "R2_PUBLIC_BASE_URL not set on the Convex deployment. " +
          "Run: npx convex env set R2_PUBLIC_BASE_URL <r2.dev subdomain or custom domain>",
      )
    }
    const publicUrl = `${baseUrl.replace(/\/$/, "")}/${args.key}`

    // Idempotent — if the key is already finalized, return the existing id.
    // Reject cross-user reuse: two users cannot share an attachment row.
    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()
    if (existing) {
      if (existing.userId !== userId) {
        throw new Error("Key collision: attachment owned by another user")
      }
      return existing._id
    }
    return await ctx.db.insert("attachments", {
      userId,
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
// Auth: viewer must match the target userId, OR be in dev mode.
export const listForUser = query({
  args: {
    devUserId: v.optional(v.id("users")),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { devUserId, userId, limit }) => {
    const identity = await resolveIdentity(ctx, { devUserId })
    const viewer = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique()
    if (!viewer || viewer._id !== userId) {
      throw new Error("Cannot list another user's attachments")
    }
    return await ctx.db
      .query("attachments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 50)
  },
})
