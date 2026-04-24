"use client"

import { useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

export type ActiveUser = {
  isLoaded: boolean
  email: string | null
  username: string | null
  fullName: string | null
  avatar: string | null
  // In dev mode this is the Convex users id of the selected seeded user;
  // null in production (callers should do a getOrCreateUser round-trip there).
  devUserId: Id<"users"> | null
  isDevMode: boolean
}

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

// Single source of truth for "who is the current user" across dev and prod.
// In dev mode the selected user id is stored in localStorage under
// `homie_dev_user_id` by <DevUserSwitcher>; in prod we fall through to Clerk.
//
// Two underlying implementations are exported: `useActiveUserDev` (calls
// only Convex, safe without a ClerkProvider) and `useActiveUserClerk`
// (calls Clerk's `useUser()`, requires ClerkProvider). The public
// `useActiveUser` dispatches to one at module load based on
// NEXT_PUBLIC_DEV_MODE — which is stable per build, so this doesn't
// violate the rules of hooks.

function useActiveUserDev(): ActiveUser {
  // undefined means "we haven't read localStorage yet" (first client render);
  // null means "we read and no user is selected". The distinction lets
  // consumers show a distinct "pick a dev user" empty state rather than a
  // generic infinite loading shell.
  const [devUserId, setDevUserId] = useState<Id<"users"> | null | undefined>(
    undefined
  )

  useEffect(() => {
    const read = () => {
      const v =
        typeof window !== "undefined"
          ? window.localStorage.getItem("homie_dev_user_id")
          : null
      setDevUserId((v as Id<"users"> | null) ?? null)
    }
    read()
    window.addEventListener("storage", read)
    return () => window.removeEventListener("storage", read)
  }, [])

  const devUser = useQuery(
    api.users.getUser,
    devUserId ? { userId: devUserId } : "skip"
  )

  // isLoaded is true when:
  //   - we've read localStorage AND either (a) no user picked (null) — so
  //     there's nothing to load or (b) we have a Convex row in hand.
  // Consumers who see devUserId === null + isDevMode === true should render
  // a "Pick a user from the DEV switcher" prompt rather than "Loading…".
  const isLoaded =
    devUserId === undefined
      ? false
      : devUserId === null
        ? true
        : devUser !== undefined

  return {
    isLoaded,
    email: devUser?.email ?? null,
    username: devUser?.username ?? null,
    fullName: devUser?.name ?? null,
    avatar: devUser?.avatar ?? null,
    devUserId: devUserId ?? null,
    isDevMode: true,
  }
}

function useActiveUserClerk(): ActiveUser {
  const clerk = useUser()
  const email = clerk.user?.primaryEmailAddress?.emailAddress ?? null

  // Callers use `!isLoaded` to decide whether to pass "skip" into Convex
  // useQuery. Clerk's own `isLoaded` only tells us whether the Clerk SDK
  // finished booting — it's `true` even when there is no signed-in user,
  // and it's `true` the instant Clerk signs a user in, long before
  // <ConvexUserBootstrap> has written the matching `users` row.
  //
  // Any backend call that runs `resolveIdentity` -> users lookup will throw
  // either "Not authenticated" (no JWT) or "User not found for identity"
  // (JWT valid, row not yet created) if we forward Clerk's isLoaded as-is.
  //
  // So: gate on Clerk ready AND signed in AND the Convex users row exists.
  // We do the row lookup here so every consumer of this hook — bell, account
  // type, profile forms, etc. — gets the correct skip semantics for free.
  const convexUser = useQuery(
    api.users.getUserByEmail,
    clerk.isLoaded && clerk.isSignedIn && email ? { email } : "skip",
  )

  const isLoaded =
    clerk.isLoaded &&
    !!clerk.isSignedIn &&
    !!email &&
    !!convexUser // undefined = still loading; null = bootstrap hasn't run yet

  return {
    isLoaded,
    email,
    username: convexUser?.username ?? clerk.user?.username ?? null,
    fullName: convexUser?.name ?? clerk.user?.fullName ?? null,
    // Prefer Clerk's live imageUrl — it updates immediately on upload,
    // before the Convex mirror catches up.
    avatar: clerk.user?.imageUrl ?? convexUser?.avatar ?? null,
    devUserId: null,
    isDevMode: false,
  }
}

export const useActiveUser: () => ActiveUser = isDevMode
  ? useActiveUserDev
  : useActiveUserClerk
