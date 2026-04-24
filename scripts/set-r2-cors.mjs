// One-shot script: sets a CORS policy on the Cloudflare R2 bucket so that
// browser-side XHR uploads (signed PUTs) from localhost + the production
// domain stop getting blocked by the browser's preflight check.
//
// Reads creds from `.env.local` (same values the Convex deployment uses).
// Run with: `node scripts/set-r2-cors.mjs`
//
// Safe to re-run — `PutBucketCors` overwrites the whole rule set each time.

import { readFileSync } from "node:fs"
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3"

function parseEnv(path) {
  const raw = readFileSync(path, "utf8")
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let value = m[2]
    // Strip inline " # comment" suffix (but not if value is quoted — keep that case simple).
    if (!/^["']/.test(value)) {
      const hashAt = value.search(/\s+#/)
      if (hashAt !== -1) value = value.slice(0, hashAt)
    }
    // Trim whitespace and one layer of quotes.
    value = value.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

const env = parseEnv(".env.local")

const accountId = env.R2_ACCOUNT_ID
const accessKeyId = env.R2_ACCESS_KEY_ID
const secretAccessKey = env.R2_SECRET_ACCESS_KEY
const bucket = env.R2_BUCKET
if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing one of R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET in .env.local")
  process.exit(1)
}

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_JURISDICTION_SPECIFIC_URL || `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: false,
})

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://homie.gg",
  "https://www.homie.gg",
  "https://homie-web.vercel.app",
  "https://*.vercel.app",
]

const corsRules = {
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedMethods: ["PUT", "GET", "HEAD", "POST"],
        AllowedOrigins: allowedOrigins,
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3000,
      },
    ],
  },
}

try {
  console.log(`Setting CORS policy on bucket "${bucket}"…`)
  await client.send(new PutBucketCorsCommand(corsRules))
  console.log("✅ CORS policy set.")

  const got = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
  console.log("\nCurrent CORS rules:")
  console.log(JSON.stringify(got.CORSRules, null, 2))
} catch (err) {
  console.error("❌ Failed to set CORS:", err?.name, err?.message)
  process.exit(1)
}
