"use client"

import { ReactNode, useMemo } from "react"
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/nextjs"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"

// ConvexProviderWithClerk decides between two token sources:
//   - If `sessionClaims.aud === "convex"`, it uses Clerk's default session
//     token directly (assumes all custom claims were merged into it).
//   - Otherwise it fetches a token from the "convex" JWT template.
//
// Our Clerk instance has the short-lived default session token already set
// to `aud: "convex"` (Clerk's newer Convex integration sets this), but it
// does NOT include our `email`/`name` custom claims — those live only on
// the "convex" JWT template. The backend's user lookups run on
// `identity.email`, so using the default token breaks every authed query
// with "User not found for identity".
//
// This shim passes through Clerk's hook but blanks out `sessionClaims` so
// ConvexProviderWithClerk always takes the template path. Safe because
// Convex only reads `sessionClaims` for this single branching decision.
function useAuthForConvex() {
  const clerk = useClerkAuth()
  return { ...clerk, sessionClaims: undefined } as ReturnType<typeof useClerkAuth>
}

// Top-level auth + Convex provider. Two shapes:
//   Production → ClerkProvider wraps ConvexProviderWithClerk (identical to
//     the previous <ClerkProvider><ConvexClientProvider/></ClerkProvider>).
//   Dev mode   → bare ConvexProvider. Clerk is bypassed entirely so we don't
//     need a configured Clerk instance to run the app. The backend
//     identity is resolved via `resolveIdentity(ctx, { devUserId })`.
//
// We create the ConvexReactClient inside useMemo (instead of at module
// scope) so that build-time static rendering of pages like /_not-found —
// which evaluates the root layout and transitively this file — does not
// crash when `NEXT_PUBLIC_CONVEX_URL` isn't yet inlined. The env var is
// still required at runtime; we surface a loud console error so the
// misconfiguration is obvious in the browser but doesn't kill the build.
export function AuthProviders({ children }: { children: ReactNode }) {
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

  const convex = useMemo(() => {
    if (!convexUrl) {
      // Intentionally soft-fail: log once and return null. The underlying
      // ConvexReactClient would throw, which would hard-crash the app on
      // any page that renders — the console message lets ops notice
      // without tanking prerender for pages that don't touch Convex.
      if (typeof window !== "undefined") {
        console.error(
          "NEXT_PUBLIC_CONVEX_URL is not set — Convex queries will not run. " +
            "Set the env var on the deployment target.",
        )
      }
      return null
    }
    return new ConvexReactClient(convexUrl)
  }, [convexUrl])

  if (!convex) {
    // No client → render children without a Convex provider. This lets
    // truly-static pages (404, marketing pages that don't query Convex)
    // still render. Pages that DO call `useQuery` will error at runtime
    // with a missing-provider message — easier to debug than a build crash.
    return <>{children}</>
  }

  if (isDevMode) {
    return <ConvexProvider client={convex}>{children}</ConvexProvider>
  }
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuthForConvex}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
