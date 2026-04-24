"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { MusicIcon, PauseCircleIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"

// Live "now playing" pill for a user's profile.
//
// Two responsibilities beyond the obvious:
//   1. Demand-gate the server-side polling. While this component is mounted
//      we ping `requestNowPlayingPoll` every 60s — that bumps the target's
//      `watchUntil` so the 30s cron sweep picks them up.
//   2. Animate progress client-side between poll refreshes. The server row
//      only updates every 30s; we add `(now - fetchedAt)` to `progressMs`
//      to make the bar feel smooth.

const POLL_PING_INTERVAL_MS = 60_000

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "0:00"
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

type Props =
  | { isSelf: true; ownerUserId?: never }
  | { isSelf?: false; ownerUserId: Id<"users"> }

export function NowPlayingPill(props: Props) {
  const { isSelf = false } = props
  const ownerUserId = isSelf ? undefined : props.ownerUserId
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  // Two useQuery calls (always called in the same order) so the argument
  // shapes of the self / friend queries don't have to unify into a single
  // union. Only one of the two is ever not "skip" per mount.
  const myNowPlaying = useQuery(
    api.spotifyFeed.getMyNowPlaying,
    !skip && isSelf ? identityArg : "skip",
  )
  const viewerNowPlaying = useQuery(
    api.spotifyFeed.getNowPlayingForViewer,
    !skip && !isSelf && ownerUserId
      ? { ownerUserId, ...identityArg }
      : "skip",
  )
  const nowPlaying = isSelf ? myNowPlaying : viewerNowPlaying

  const requestPoll = useIdentifiedMutation(api.spotifySync.requestNowPlayingPoll)

  // Ping the poll gate on mount + every minute while mounted. We skip the
  // ping for self because the user can just hit "Sync now" — we don't want
  // to spend cron cycles on one's own profile view.
  React.useEffect(() => {
    if (isSelf || skip || !ownerUserId) return
    let cancelled = false
    const targetId = ownerUserId
    const ping = () => {
      if (cancelled) return
      requestPoll({ ownerUserId: targetId }).catch(() => {
        // swallow — non-fatal, likely a friend-gate rejection
      })
    }
    ping()
    const id = setInterval(ping, POLL_PING_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isSelf, skip, ownerUserId, requestPoll])

  // Client-side progress extrapolation. We re-render every second while the
  // track is playing so the progress bar moves between server updates.
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!nowPlaying?.isPlaying) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [nowPlaying?.isPlaying])

  if (nowPlaying === undefined || nowPlaying === null) return null
  if (!nowPlaying.title) return null

  const extrapolatedProgress =
    nowPlaying.progressMs !== undefined && nowPlaying.isPlaying
      ? Math.min(
          (nowPlaying.progressMs ?? 0) +
            (Date.now() - nowPlaying.fetchedAt),
          nowPlaying.durationMs ?? Number.MAX_SAFE_INTEGER,
        )
      : (nowPlaying.progressMs ?? 0)

  const pct =
    nowPlaying.durationMs && nowPlaying.durationMs > 0
      ? (extrapolatedProgress / nowPlaying.durationMs) * 100
      : 0

  // `tick` is read here so ESLint sees it as a dependency and doesn't warn
  // about an unused state setter — the value itself is irrelevant.
  void tick

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      {nowPlaying.albumImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={nowPlaying.albumImageUrl}
          alt=""
          width={48}
          height={48}
          className="rounded-md"
        />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-md bg-muted">
          <MusicIcon className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {nowPlaying.isPlaying ? (
            <span
              aria-label="playing"
              className="inline-block size-2 animate-pulse rounded-full bg-green-500"
            />
          ) : (
            <PauseCircleIcon className="size-3.5 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">
            {nowPlaying.title}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {nowPlaying.artists}
        </div>
        {nowPlaying.durationMs ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {formatMs(extrapolatedProgress)} / {formatMs(nowPlaying.durationMs)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
