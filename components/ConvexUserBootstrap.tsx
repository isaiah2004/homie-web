"use client"

import * as React from "react"
import { useUser } from "@clerk/nextjs"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"

// <ConvexUserBootstrap /> — a single, centralized `getOrCreateUser` call that
// runs once per dashboard session (per authenticated user). Mounted inside
// `app/dashboard/layout.tsx` so every dashboard route inherits it.
//
// Why: several pages (Homie, profile, friends, etc.) each kick off their own
// `getOrCreateUser` on mount. That's a no-op on existing rows, but it means
// the `accountType` passed from Clerk's `unsafeMetadata.accountType` can be
// lost if one of the other call sites runs first without it. Having a single
// bootstrapper at the layout level guarantees the FIRST call for a brand-new
// user always includes the signup-intent metadata.
//
// Dev mode: the dev switcher already gives us the Convex users id directly,
// so there's no Clerk → Convex mapping to bootstrap. We no-op entirely.
//
// Per-page `getOrCreateUser` calls remain as a belt-and-suspenders fallback;
// the `users.getOrCreateUser` mutation is idempotent and only writes
// `accountType` on INSERT, so duplicate calls are safe.
const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

export function ConvexUserBootstrap() {
  // In dev mode Clerk isn't mounted at all — calling useUser() here would
  // throw. Short-circuit by rendering a no-op component that never uses the
  // hook. Using a static null return keeps the tree stable.
  if (isDevMode) {
    return null
  }
  return <ProdBootstrap />
}

function ProdBootstrap() {
  const { user, isLoaded, isSignedIn } = useUser()
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)

  // Single bootstrap per user id. React strict-mode double-invocation on
  // development would fire two calls; we guard with a ref so only the first
  // wins. Production strict-mode does NOT double-invoke, so this is just
  // defensive.
  const bootstrappedForUserIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return

    const email = user.primaryEmailAddress?.emailAddress
    if (!email) return

    // Guard: only bootstrap once per Clerk user id.
    if (bootstrappedForUserIdRef.current === user.id) return
    bootstrappedForUserIdRef.current = user.id

    // Clerk's unsafeMetadata is loosely typed; narrow to our literal union.
    const metaAccountType = user.unsafeMetadata?.accountType
    const accountType: "personal" | "business" | undefined =
      metaAccountType === "business"
        ? "business"
        : metaAccountType === "personal"
          ? "personal"
          : undefined

    getOrCreateUser({
      email,
      name: user.fullName ?? undefined,
      username: user.username ?? undefined,
      avatar: user.imageUrl || undefined,
      accountType,
    }).catch((err) => {
      // Bootstrapping is best-effort — most pages call `getOrCreateUser`
      // again on mount, which will succeed. Clear the ref so a remount can
      // retry.
      console.error("ConvexUserBootstrap: getOrCreateUser failed", err)
      bootstrappedForUserIdRef.current = null
    })
  }, [isLoaded, isSignedIn, user, getOrCreateUser])

  return null
}
