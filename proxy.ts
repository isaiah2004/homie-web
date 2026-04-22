import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

// Anything under /dashboard requires an authenticated Clerk session. Without
// this gate, bare `clerkMiddleware()` would let anonymous traffic through
// and the page would render — causing any Convex query that calls
// `resolveIdentity` (e.g. <NotificationBell>) to throw "Not authenticated"
// before the user ever sees a redirect. `auth.protect()` short-circuits
// with a 307 to Clerk's sign-in URL, which is what we want.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"])

// In dev mode we short-circuit the middleware entirely so request handling
// never touches Clerk (no Clerk keys needed locally). In production this
// runs Clerk middleware and enforces auth on /dashboard.
export default isDevMode
  ? () => undefined
  : clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        await auth.protect()
      }
    })

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
