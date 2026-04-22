"use client"

import { SignUp } from "@clerk/nextjs"

// Business-account Clerk sign-up.
//
// Identical to the personal variant except:
//   - `unsafeMetadata.accountType` is "business" (read by
//     <ConvexUserBootstrap> and forwarded to `getOrCreateUser`).
//   - `forceRedirectUrl` / `fallbackRedirectUrl` point at the
//     /dashboard/business workspace instead of /dashboard/homie.
//
// The mutation only writes `accountType` on INSERT, so if a user somehow
// signs up on this route with an already-existing Convex row (e.g. they
// switched account types mid-flow), the existing row is left untouched.
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0910] p-6">
      <SignUp
        routing="path"
        path="/sign-up/business"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard/business"
        fallbackRedirectUrl="/dashboard/business"
        unsafeMetadata={{ accountType: "business" }}
      />
    </main>
  )
}
