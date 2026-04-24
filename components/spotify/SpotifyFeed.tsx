"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { MusicIcon, PlayIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SpotifyEmbed } from "./SpotifyEmbed"

// Spotify track feed for a user. Used in two places:
//   - `/dashboard/integrations` — the owner's own feed.
//   - `/dashboard/profile/[id]` (or wherever) — a viewer's view of a friend.
//
// Click a track → its Spotify embed iframe expands inline underneath; only
// one is open at a time so we don't spawn 50 players on render.

type FeedKind = "top_short" | "top_medium" | "top_long" | "liked" | "recent"

const KIND_LABELS: Record<FeedKind, string> = {
  top_short: "Top · 4 weeks",
  top_medium: "Top · 6 months",
  top_long: "Top · all time",
  liked: "Liked",
  recent: "Recent",
}

type Track = {
  _id: Id<"spotifyUserTracks">
  spotifyTrackId: string
  title: string
  artists: string
  albumImageUrl?: string
  playedAt?: number
  addedAt?: number
  rank?: number
}

function timeAgo(t: number | undefined): string {
  if (!t) return ""
  const diff = Date.now() - t
  if (diff < 60_000) return "just now"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function TrackRow({
  track,
  kind,
  isOpen,
  onToggle,
}: {
  track: Track
  kind: FeedKind
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
      >
        {track.albumImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.albumImageUrl}
            alt=""
            width={40}
            height={40}
            className="rounded"
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded bg-muted">
            <MusicIcon className="size-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {kind.startsWith("top_") && track.rank ? `${track.rank}. ` : ""}
            {track.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {track.artists}
            {kind === "recent" && track.playedAt
              ? ` · played ${timeAgo(track.playedAt)}`
              : kind === "liked" && track.addedAt
                ? ` · liked ${timeAgo(track.addedAt)}`
                : ""}
          </div>
        </div>
        <PlayIcon className="size-4 text-muted-foreground" />
      </button>
      {isOpen ? (
        <div className="border-t p-3">
          <SpotifyEmbed spotifyTrackId={track.spotifyTrackId} compact />
        </div>
      ) : null}
    </div>
  )
}

function FeedPanel({
  ownerUserId,
  isSelf,
  kind,
}: {
  ownerUserId?: Id<"users">
  isSelf: boolean
  kind: FeedKind
}) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const tracks = useQuery(
    isSelf ? api.spotifyFeed.listMyTracks : api.spotifyFeed.listUserTracksForViewer,
    skip
      ? "skip"
      : isSelf
        ? { kind, ...identityArg }
        : ownerUserId
          ? { ownerUserId, kind, ...identityArg }
          : "skip",
  )

  const [openId, setOpenId] = React.useState<Id<"spotifyUserTracks"> | null>(
    null,
  )

  if (tracks === undefined) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  }
  if (tracks === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Hidden. Only friends can see this feed.
      </div>
    )
  }
  if (tracks.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {isSelf
          ? "Nothing yet. Press Sync now to pull fresh data."
          : "No tracks yet."}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {tracks.map((t) => (
        <TrackRow
          key={t._id}
          track={t}
          kind={kind}
          isOpen={openId === t._id}
          onToggle={() => setOpenId(openId === t._id ? null : t._id)}
        />
      ))}
    </div>
  )
}

export function SpotifyFeed({
  ownerUserId,
  isSelf = false,
}: {
  ownerUserId?: Id<"users">
  isSelf?: boolean
}) {
  const [kind, setKind] = React.useState<FeedKind>("top_short")

  return (
    <Tabs value={kind} onValueChange={(v) => setKind(v as FeedKind)}>
      <TabsList>
        {(Object.keys(KIND_LABELS) as FeedKind[]).map((k) => (
          <TabsTrigger key={k} value={k}>
            {KIND_LABELS[k]}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(KIND_LABELS) as FeedKind[]).map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <FeedPanel ownerUserId={ownerUserId} isSelf={isSelf} kind={k} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
