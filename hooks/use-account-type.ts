"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "./use-active-user"

export type AccountType = "personal" | "business"

export type UseAccountTypeResult = {
  accountType: AccountType | null
  isLoaded: boolean
}

// Resolves the current viewer's `accountType` field on the `users` row.
//
// Why this is its own hook: in dev mode we have `devUserId` in localStorage and
// can feed it straight into `getAccountType`. In prod we only have a Clerk
// email synchronously, so we need an extra `getUserByEmail` hop to convert it
// into a Convex users id before querying the account type.
//
// Returns `{ accountType: null, isLoaded: true }` once everything has
// resolved but no user is signed in (pre-login or dev-mode-no-user-selected)
// so callers can short-circuit without a loading spinner.
//
// While the lookup is in flight, `accountType` is `null` and `isLoaded` is
// `false`. Consumers should default the UI to the personal-account view in
// that window — showing an extra nav item briefly is preferable to hiding
// one the user is entitled to see.
export function useAccountType(): UseAccountTypeResult {
  const activeUser = useActiveUser()
  const { isDevMode, devUserId, email, isLoaded: activeUserLoaded } = activeUser

  // Prod-only: resolve Clerk email -> Convex users row. Skipped entirely in
  // dev mode since `devUserId` is already the users id we need.
  const userByEmail = useQuery(
    api.users.getUserByEmail,
    !isDevMode && activeUserLoaded && email ? { email } : "skip",
  )

  // The users id we'll hand to `getAccountType`. In dev mode this is the
  // localStorage-selected user; in prod it's whatever `getUserByEmail`
  // returned. Null means we genuinely have no user (signed out / no picker
  // selection) and we shouldn't bother issuing the account-type query.
  const resolvedUserId: Id<"users"> | null = isDevMode
    ? devUserId
    : (userByEmail?._id ?? null)

  const accountType = useQuery(
    api.users.getAccountType,
    resolvedUserId ? { userId: resolvedUserId } : "skip",
  )

  // Pre-login / no-user states: flag as loaded with a null accountType so
  // consumers don't block UI waiting for something that will never arrive.
  if (isDevMode) {
    if (!activeUserLoaded) {
      return { accountType: null, isLoaded: false }
    }
    if (!devUserId) {
      return { accountType: null, isLoaded: true }
    }
  } else {
    if (!activeUserLoaded) {
      return { accountType: null, isLoaded: false }
    }
    if (!email) {
      return { accountType: null, isLoaded: true }
    }
    // Waiting on email -> users row lookup.
    if (userByEmail === undefined) {
      return { accountType: null, isLoaded: false }
    }
    if (userByEmail === null) {
      // Clerk email has no matching Convex row yet (first-time sign-in,
      // pre-`getOrCreateUser`). Nothing to resolve — let the caller fall
      // back to the default personal view.
      return { accountType: null, isLoaded: true }
    }
  }

  if (accountType === undefined) {
    return { accountType: null, isLoaded: false }
  }

  return { accountType, isLoaded: true }
}
