"use client"

import { useCallback, useMemo } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionArgs, FunctionReference } from "convex/server"
import { useActiveUser } from "./use-active-user"

// Thin wrappers over Convex's `useAction` / `useMutation` that auto-inject
// `devUserId` when dev mode is enabled. Call sites keep the same ergonomic
// signature — `run(args)` — and the injection is invisible in production.
//
// The returned invoker is memoized so it's safe to use in effect deps
// without causing render loops.
//
// Example:
//   const search = useIdentifiedAction(api.spotify.searchSpotify)
//   await search({ query: "sampha" }) // devUserId added in dev mode

export function useIdentifiedAction<Ref extends FunctionReference<"action">>(
  ref: Ref
) {
  const run = useAction(ref)
  const { devUserId, isDevMode } = useActiveUser()
  return useCallback(
    (args: FunctionArgs<Ref>) => {
      const merged =
        isDevMode && devUserId
          ? ({ ...args, devUserId } as FunctionArgs<Ref>)
          : args
      return run(merged)
    },
    [run, devUserId, isDevMode],
  )
}

// For mutations we return a plain invoker. `withOptimisticUpdate` is not
// supported here — callers that need optimistic updates should keep using
// Convex's `useMutation` directly and thread `devUserId` manually.
export function useIdentifiedMutation<
  Ref extends FunctionReference<"mutation">,
>(ref: Ref) {
  const run = useMutation(ref)
  const { devUserId, isDevMode } = useActiveUser()
  return useCallback(
    (args: FunctionArgs<Ref>) => {
      const merged =
        isDevMode && devUserId
          ? ({ ...args, devUserId } as FunctionArgs<Ref>)
          : args
      return run(merged)
    },
    [run, devUserId, isDevMode],
  )
}

// Thin wrapper over Convex's `useQuery` that auto-injects `devUserId` in dev
// mode and respects the same skip semantics as the underlying hook. Pass
// `"skip"` as the args to defer the query (same behavior as `useQuery`).
//
// In production this is a passthrough — the dev fields are stripped, so the
// query is called with the bare args object the caller provided.
//
// Example:
//   const supervision = useIdentifiedQuery(api.family.getMySupervision, {})
//   if (supervision === undefined) return <Loading />
export function useIdentifiedQuery<Ref extends FunctionReference<"query">>(
  ref: Ref,
  args: FunctionArgs<Ref> | "skip",
) {
  const { devUserId, isDevMode } = useActiveUser()
  const merged = useMemo(() => {
    if (args === "skip") return "skip" as const
    if (isDevMode && devUserId) {
      return { ...args, devUserId } as FunctionArgs<Ref>
    }
    return args
  }, [args, devUserId, isDevMode])
  return useQuery(ref, merged)
}
