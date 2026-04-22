"use client"

import { ReactNode } from "react"
import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file")
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL)
const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

// Top-level auth + Convex provider. Two shapes:
//   Production → ClerkProvider wraps ConvexProviderWithClerk (identical to
//     the previous <ClerkProvider><ConvexClientProvider/></ClerkProvider>).
//   Dev mode   → bare ConvexProvider. Clerk is bypassed entirely so we don't
//     need a configured Clerk instance to run the app. The backend
//     identity is resolved via `resolveIdentity(ctx, { devUserId })`.
export function AuthProviders({ children }: { children: ReactNode }) {
  if (isDevMode) {
    return <ConvexProvider client={convex}>{children}</ConvexProvider>
  }
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
