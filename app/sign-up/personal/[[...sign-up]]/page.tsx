"use client"

import { SignUp } from "@clerk/nextjs"

// Personal-account Clerk sign-up.
//
// Clerk's `unsafeMetadata` is attached to the new user at create time —
// we read it back from `useUser().user?.unsafeMetadata.accountType` in
// <ConvexUserBootstrap> to pass through to `api.users.getOrCreateUser`.
// "unsafe" in Clerk's vocabulary means "user-supplied" (writable from the
// client) which is fine here: a user can only choose their own signup intent.
//
// The `[[...sign-up]]` catch-all route is Clerk's recommended layout so
// Clerk-internal sub-pages (email verification, username selection, MFA,
// etc.) render under the same URL prefix without needing extra routes.
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0910] p-6">
      <SignUp
        routing="path"
        path="/sign-up/personal"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard/homie"
        fallbackRedirectUrl="/dashboard/homie"
        unsafeMetadata={{ accountType: "personal" }}
      />
    </main>
  )
}
