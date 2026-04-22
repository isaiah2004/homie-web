import { clerkMiddleware } from "@clerk/nextjs/server"

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

// In dev mode we short-circuit the middleware entirely so request handling
// never touches Clerk (no Clerk keys needed locally). In production this
// is the standard Clerk middleware.
export default isDevMode ? () => undefined : clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
