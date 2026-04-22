"use node"

import { v } from "convex/values"
import { action } from "./_generated/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "crypto"
import { getR2Client, getBucket, getPublicUrl } from "./lib/r2"
import { classifyMime } from "./lib/mime"

// Mint a presigned PUT URL for Cloudflare R2. Clients upload directly to R2
// with a single XHR PUT, then call `attachments.finalizeUpload` to insert
// the row. The mutation re-validates size/type so the action's checks can't
// be bypassed by a malicious caller.
export const generateUploadUrl = action({
  args: {
    userId: v.id("users"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    key: v.string(),
    publicUrl: v.string(),
  }),
  handler: async (_ctx, { userId, fileName, contentType, size }) => {
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
    }
  },
})
