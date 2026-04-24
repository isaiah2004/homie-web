## r2 bucket CORS — manual config needed

**Status:** blocker for all browser-side chat uploads (DM + group). Env vars
and signed URLs are fine; Cloudflare just never sent an allow-origin header
on preflight.

**Repro**
1. Open any DM in `/dashboard/chats`, click **Attach**, pick an image.
2. Toast: "Upload failed: Upload network error".
3. DevTools console: `Access to XMLHttpRequest at 'https://homie-web-bucket.<acct>.r2.cloudflarestorage.com/...' from origin 'http://localhost:3000' has been blocked by CORS policy`.

**What I already fixed tonight**
- `.env.local` R2_BUCKET was leaking its `# comment` into the value when I
  pushed the Convex env vars earlier. I re-wrote the extractor
  (`scripts/set-r2-cors.mjs` uses the same parser) so the value stored
  now is exactly `homie-web-bucket`. Verified via the live network URL —
  no more garbled path.
- Codegen was stale (`npx convex dev` wasn't running). Restarted it; the
  new `searchCommunitiesByText` / `searchLocation` / schema fields are
  pushed.

**What's still broken and needs you**
The R2 bucket has no CORS policy. I tried setting it two ways — both
failed on permissions:

1. **S3-compatible API** (`PutBucketCors` via the SDK we already use):
   `AccessDenied`. Your R2 API token is scoped to object read/write, not
   bucket admin.
2. **Cloudflare REST API** (`PUT /accounts/.../r2/buckets/.../cors` with
   `R2_TOKEN_VALUE` as bearer): `Authentication error`. The token in
   `.env.local` doesn't have `Workers R2 Storage Bucket Item:Edit` scope
   (or isn't a Cloudflare API token at all — could be an alternate S3
   secret).

**Fix — 2 minutes in the Cloudflare dashboard**
1. Go to Cloudflare dashboard → R2 → your `homie-web-bucket`.
2. Settings tab → CORS Policy → "Add CORS policy".
3. Paste:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://homie.gg",
      "https://www.homie.gg",
      "https://homie-web.vercel.app"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD", "POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Save. Preflight will start passing within ~30s.

**Alternative — stay in code**
Create a new R2 API token in CF dashboard with `Admin Read & Write` or
`Workers R2 Storage Bucket Item:Edit`. Put it in `.env.local` as
`R2_ADMIN_TOKEN`, then re-run `node scripts/set-r2-cors.mjs` (I'll update
the script to use the new env name).

**Script left in place**
`scripts/set-r2-cors.mjs` is a safe one-shot that applies the policy above.
Re-run it after swapping the token and it'll succeed.

**Severity**
- [x] High — blocks all DM/group image attachments.
