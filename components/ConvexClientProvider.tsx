"use client"

// Retained for backward compatibility. New code should use
// `<AuthProviders>` from `@/components/AuthProviders`, which wraps Clerk
// and Convex (or falls back to a bare ConvexProvider in dev mode).

import { ReactNode } from "react"
import { AuthProviders } from "@/components/AuthProviders"

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode
}) {
  return <AuthProviders>{children}</AuthProviders>
}
