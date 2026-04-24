"use client"

import { ExternalLinkIcon, MusicIcon, RadioIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

// Rendered when the model calls `findFriendsListeningTo`. Tool output is a
// list of owner-blocks (asker + friends who have connected Spotify), each
// with a short list of tracks pulled straight from `spotifyUserTracks`.
// We group per owner so the user visually sees who's behind each row
// rather than a flat track list that mixes everyone together.

export type FriendsListeningTrack = {
  _id: string
  spotifyTrackId: string
  uri?: string
  title: string
  artists: string
  albumImageUrl?: string | null
  previewUrl?: string | null
  playedAt?: number | null
  addedAt?: number | null
  rank?: number | null
}

export type FriendsListeningBlock = {
  ownerId: string
  ownerName: string
  ownerUsername?: string | null
  ownerAvatar?: string | null
  isSelf: boolean
  tracks: FriendsListeningTrack[]
}

export type FriendsListeningToOutput = {
  kind:
    | "liked"
    | "recent"
    | "top_short"
    | "top_medium"
    | "top_long"
  query?: string | null
  blocks: FriendsListeningBlock[]
}

const KIND_LABEL: Record<FriendsListeningToOutput["kind"], string> = {
  liked: "Liked",
  recent: "Recently played",
  top_short: "Top · last 4 weeks",
  top_medium: "Top · last 6 months",
  top_long: "Top · all time",
}

export function FriendsListeningToCard({
  data,
  className,
}: {
  data: FriendsListeningToOutput
  className?: string
}) {
  if (!data.blocks || data.blocks.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No Spotify listening data"
        body={
          data.query
            ? `Nothing matching "${data.query}" in your friends' recent Spotify history. Try a broader term, or ask them to connect Spotify at /dashboard/integrations.`
            : "Nobody in your friend graph has connected Spotify yet. You can connect yours at /dashboard/integrations."
        }
      />
    )
  }
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RadioIcon className="size-3" />
        <span>
          {KIND_LABEL[data.kind]}
          {data.query ? ` · filtered by "${data.query}"` : ""}
        </span>
      </div>
      <div className="space-y-3">
        {data.blocks.map((block) => (
          <OwnerBlock key={block.ownerId} block={block} />
        ))}
      </div>
    </div>
  )
}

function OwnerBlock({ block }: { block: FriendsListeningBlock }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-3 py-2">
        <Avatar className="size-7 shrink-0">
          <AvatarImage
            src={block.ownerAvatar ?? undefined}
            alt={block.ownerName}
          />
          <AvatarFallback className="text-[10px]">
            {block.ownerName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{block.ownerName}</p>
          {block.ownerUsername && (
            <p className="truncate text-[10px] text-muted-foreground">
              @{block.ownerUsername}
            </p>
          )}
        </div>
        {block.isSelf ? (
          <Badge variant="outline" className="text-[9px] uppercase">
            You
          </Badge>
        ) : null}
        <Badge variant="secondary" className="text-[9px]">
          {block.tracks.length} track{block.tracks.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <ul className="divide-y">
        {block.tracks.map((t, i) => (
          <TrackRow key={t._id} track={t} rank={t.rank ?? i + 1} />
        ))}
      </ul>
    </div>
  )
}

function TrackRow({
  track,
  rank,
}: {
  track: FriendsListeningTrack
  rank: number
}) {
  const spotifyOpenUrl = track.uri?.startsWith("spotify:track:")
    ? `https://open.spotify.com/track/${track.uri.slice("spotify:track:".length)}`
    : track.spotifyTrackId
      ? `https://open.spotify.com/track/${track.spotifyTrackId}`
      : null
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="w-5 shrink-0 text-right text-[10px] text-muted-foreground">
        {rank}
      </span>
      {track.albumImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.albumImageUrl}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
          <MusicIcon className="size-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={track.title}>
          {track.title}
        </p>
        <p
          className="truncate text-[11px] text-muted-foreground"
          title={track.artists}
        >
          {track.artists}
        </p>
      </div>
      {spotifyOpenUrl ? (
        <a
          href={spotifyOpenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Open ${track.title} in Spotify`}
          title="Open in Spotify"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      ) : null}
    </li>
  )
}
