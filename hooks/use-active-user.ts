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
    devUserId: devUserId ?? null,
    isDevMode: true,
  }
}

function useActiveUserClerk(): ActiveUser {
  const clerk = useUser()
  return {
    isLoaded: clerk.isLoaded,
    email: clerk.user?.primaryEmailAddress?.emailAddress ?? null,
    username: clerk.user?.username ?? null,
    fullName: clerk.user?.fullName ?? null,
    devUserId: null,
    isDevMode: false,
  }
}

export const useActiveUser: () => ActiveUser = isDevMode
  ? useActiveUserDev
  : useActiveUserClerk
