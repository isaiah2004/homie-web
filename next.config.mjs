/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silences Next 16's dev-only cross-origin warning when running against
  // 127.0.0.1 while Next defaults to localhost. Dev-only; has no prod effect.
  allowedDevOrigins: ["127.0.0.1"],
}

export default nextConfig
