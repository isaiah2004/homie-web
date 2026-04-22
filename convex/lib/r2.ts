"use node"

import { S3Client } from "@aws-sdk/client-s3"

// Cloudflare R2 client helpers. Isolated in a "use node" module because
// `@aws-sdk/client-s3` relies on Node built-ins. Only import from other
// files that also have `"use node"` (e.g. `convex/r2.ts`).

let client: S3Client | null = null

function r2Endpoint(): string {
  const jurisdiction = process.env.R2_JURISDICTION_SPECIFIC_URL
  if (jurisdiction) return jurisdiction
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      "R2 not configured: set R2_ACCOUNT_ID (or R2_JURISDICTION_SPECIFIC_URL) " +
        "on the Convex deployment via: npx convex env set R2_ACCOUNT_ID <value>",
    )
  }
  return `https://${accountId}.r2.cloudflarestorage.com`
}

export function getR2Client(): S3Client {
  if (client) return client
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 not configured: set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY via " +
        "npx convex env set.",
    )
  }
  client = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(),
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  })
  return client
}

export function getBucket(): string {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET env var required")
  return bucket
}

export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL
  if (!base) {
    throw new Error(
      "R2 not configured: set R2_PUBLIC_BASE_URL (e.g. r2.dev subdomain or custom domain).",
    )
  }
  const trimmed = base.replace(/\/$/, "")
  return `${trimmed}/${key}`
}
