"use node"

import { v } from "convex/values"
import { action } from "./_generated/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "crypto"
import { getR2Client, getBucket, getPublicUrl } from "./lib/r2"
import { classifyMime } from "./lib/mime"
import { resolveIdentity } from "./lib/identity"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"

// Mint a presigned PUT URL for Cloudflare R2. Clients upload directly to R2
// with a single XHR PUT, then call `attachments.finalizeUpload` to insert
// the row. The mutation re-validates size/type so the action's checks can't
// be bypassed by a malicious caller.
//
// Auth: `resolveIdentity` enforces that the caller is either a signed-in
// Clerk user (prod) OR the dev mode switcher's `devUserId` (dev). The
// resolved identity's email is then matched against a users row — we key
// the R2 object path by that authoritative user id, NOT by a client-supplied
// one, so a caller can't pollute another user's key prefix.
export const generateUploadUrl = action({
  args: {
    devUserId: v.optional(v.id("users")),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    key: v.string(),
    publicUrl: v.string(),
    userId: v.id("users"),
  }),
  handler: async (
    ctx,
    { devUserId, fileName, contentType, size },
  ): Promise<{
    uploadUrl: string
    key: string
    publicUrl: string
    userId: Id<"users">
  }> => {
    const identity = await resolveIdentity(ctx, { devUserId })
    // Look up the authoritative user id from the identity's email so the
    // R2 key prefix can never be spoofed by the caller.
    const user = (await ctx.runQuery(internal.users.getUserByEmailInternal, {
      email: identity.email,
    })) as { _id: Id<"users"> } | null
    if (!user) throw new Error("User not found for identity")
    const userId = user._id

    const mime = classifyMime(contentType)
    if (!mime) {
      throw new Error(`Unsupported file type: ${contentType}`)
    }
    if (size > mime.maxSize) {
      throw new Error(
        `File too large: ${size} bytes exceeds limit ${mime.maxSize} for ${contentType}`,
      )
    }
    const sanitizedName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120)
    const key = `dm/${userId}/${randomUUID()}-${sanitizedName}`
    const client = getR2Client()
    const bucket = getBucket()
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 900 },
    )
    return {
      uploadUrl,
      key,
      publicUrl: getPublicUrl(key),
      userId,
    }
  },
})
