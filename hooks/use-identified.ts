"use client"

import { useAction, useMutation } from "convex/react"
import type { FunctionArgs, FunctionReference } from "convex/server"
import { useActiveUser } from "./use-active-user"

// Thin wrappers over Convex's `useAction` / `useMutation` that auto-inject
// `devUserId` when dev mode is enabled. Call sites keep the same ergonomic
// signature — `run(args)` — and the injection is invisible in production.
//
// Example:
//   const search = useIdentifiedAction(api.spotify.searchSpotify)
//   await search({ query: "sampha" }) // devUserId added in dev mode

export function useIdentifiedAction<Ref extends FunctionReference<"action">>(
  ref: Ref
) {
  const run = useAction(ref)
  const { devUserId, isDevMode } = useActiveUser()
  return (args: FunctionArgs<Ref>) => {
    const merged =
      isDevMode && devUserId
        ? ({ ...args, devUserId } as FunctionArgs<Ref>)
        : args
    return run(merged)
  }
}

// For mutations we return a plain invoker. `withOptimisticUpdate` is not
// supported here — callers that need optimistic updates should keep using
// Convex's `useMutation` directly and thread `devUserId` manually.
export function useIdentifiedMutation<
  Ref extends FunctionReference<"mutation">,
>(ref: Ref) {
  const run = useMutation(ref)
  const { devUserId, isDevMode } = useActiveUser()
  return (args: FunctionArgs<Ref>) => {
    const merged =
      isDevMode && devUserId
        ? ({ ...args, devUserId } as FunctionArgs<Ref>)
        : args
    return run(merged)
  }
}
