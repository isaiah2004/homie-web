// Hard-fail a production build that accidentally ships with
// NEXT_PUBLIC_DEV_MODE=true. `NEXT_PUBLIC_*` envs are baked into the client
// bundle at build time, so a misconfigured build would ship a live
// Clerk-bypass to production users.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_DEV_MODE === "true"
) {
  throw new Error(
    "NEXT_PUBLIC_DEV_MODE must not be 'true' in a production build — " +
      "it would bypass Clerk auth for every visitor. Unset it before `next build`."
  )
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silences Next 16's dev-only cross-origin warning when running against
  // 127.0.0.1 while Next defaults to localhost. Dev-only; has no prod effect.
  allowedDevOrigins: ["127.0.0.1"],
}

export default nextConfig
