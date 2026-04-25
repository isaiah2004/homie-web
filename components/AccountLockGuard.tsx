"use client"

// <AccountLockGuard /> — outer-shell guard for the dashboard.
//
// When a child account has `flags.accountLocked === true` set by their
// guardian, we replace the entire dashboard view with a fullscreen
// interstitial so the child can't navigate any product surface (chats,
// friends, communities, profile editor, etc.) while locked.
//
// Resolution semantics:
//   - Adults / non-child accounts: render children unchanged.
//   - Children whose `getMySupervision` query is still loading: render
//     children (don't briefly hide the whole UI on every page load).
//   - Children with `flags.accountLocked === true`: render the interstitial
//     and nothing else.
//
// We deliberately read the *raw* stored flag value here rather than
// applying age-band defaults — the default for both bands is `false`, and
// only an explicit set by a guardian should lock the account. Treating the
// default as "false" matches `convex/_lib/childPolicy.ts:DEFAULT_FLAGS` for
// `accountLocked` and avoids accidentally locking children whose settings
// row is missing the field.

import * as React from "react"
import { LockIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedQuery } from "@/hooks/use-identified"

export function AccountLockGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const activeUser = useActiveUser()

  // Skip the supervision query until identity is resolved. In dev mode that
  // means waiting for a `devUserId`; in prod it's the active-user hook
  // reporting `isLoaded`.
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded

  const supervision = useIdentifiedQuery(
    api.family.getMySupervision,
    skip ? "skip" : {},
  )

  // Non-child + still-loading both render the dashboard normally. The query
  // returns `null` for non-child callers, so this branch handles both.
  const locked = Boolean(supervision?.settings?.flags.accountLocked)

  if (!locked) {
    return <>{children}</>
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <LockIcon className="size-6 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Your account is locked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your guardian has locked this account. Contact your parent to unlock
          it.
        </p>
      </div>
    </div>
  )
}
