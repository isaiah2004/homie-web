"use client"

import { SignIn } from "@clerk/nextjs"

// Clerk sign-in. Catches /sign-in and all Clerk-internal sub-paths
// (verify email, factor, etc). Paired with /sign-up/personal and
// /sign-up/business — this route is account-type agnostic since
// account type was locked at signup.
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0910] p-6">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
      />
    </main>
  )
}
