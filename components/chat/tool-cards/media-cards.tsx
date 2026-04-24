"use client"

import * as React from "react"
import { ExternalLinkIcon, MusicIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

// Shared shape for provider-backed search results. All the search actions
// (Spotify, iTunes, Open Library, Jikan, CheapShark) already return this
// envelope — see `NormalizedSpotifyResult` etc in the convex provider
// modules.
export type ProviderResult = {
  source: string
  kind?: string
  id: string | number
  uri?: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
}

type SearchEnvelope = {
  query: string
  results: ProviderResult[] | null | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Songs (Spotify) — dense poster grid with square album art + title + subtitle.
// Tracks get an inline 80px Spotify compact player; albums / artists / shows
// just link out (their default embed is ~352px and would make the chat bubble
// taller than the viewport for a 6-result query).
// ─────────────────────────────────────────────────────────────────────────────

export function SearchSongsCard({
  data,
  className,
}: {
  data: SearchEnvelope
  className?: string
}) {
  const results = data.results ?? []
  if (results.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No songs found"
        body={`Nothing on Spotify matched "${data.query}".`}
      />
    )
  }
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {results.map((r) => (
        <SongCard key={`${r.source}-${r.kind ?? "item"}-${r.id}`} data={r} />
      ))}
    </div>
  )
}

export function SongCard({
  data,
  className,
}: {
  data: ProviderResult
  className?: string
}) {
  // Spotify embed URL — only works for track/album/artist/playlist/episode.
  // We only render the embed inline for tracks (the `theme=0` variant is the
  // 80px compact player). Other kinds link out instead.
  const isTrack = data.source === "spotify" && data.kind === "track"
  const embedSrc = isTrack
    ? `https://open.spotify.com/embed/${data.kind}/${data.id}?theme=0`
    : null
  const openUrl =
    data.source === "spotify" && data.kind
      ? `https://open.spotify.com/${data.kind}/${data.id}`
      : null

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.imageUrl}
          alt=""
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <MusicIcon className="size-8 opacity-80" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p
          className="line-clamp-2 text-xs font-medium leading-tight"
          title={data.title}
        >
          {data.title}
        </p>
        {data.subtitle && (
          <p
            className="line-clamp-1 text-[10px] text-muted-foreground"
            title={data.subtitle}
          >
            {data.subtitle}
          </p>
        )}
        {data.kind && (
          <Badge
            variant="outline"
            className="mt-auto w-fit text-[9px] uppercase tracking-wide"
          >
            {data.kind}
          </Badge>
        )}
      </div>
      {embedSrc ? (
        <iframe
          title={data.title}
          src={embedSrc}
          height={92}
          className="block w-full border-t"
          allow="encrypted-media"
        />
      ) : openUrl ? (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t bg-muted/30 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3" />
          Open in Spotify
        </a>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Poster-style grid — used for movies, books, games, anime. All share the
// same ProviderResult shape so we reuse one component with different copy
// and fallback gradients.
// ─────────────────────────────────────────────────────────────────────────────

type MediaFamily = "movie" | "book" | "game" | "anime"

const familyCopy: Record<
  MediaFamily,
  { emptyTitle: string; emptyBodyPrefix: string; gradient: string }
> = {
  movie: {
    emptyTitle: "No movies found",
    emptyBodyPrefix: "Nothing on iTunes matched",
    gradient: "from-rose-500 to-red-700",
  },
  book: {
    emptyTitle: "No books found",
    emptyBodyPrefix: "Open Library had no results for",
    gradient: "from-amber-500 to-orange-700",
  },
  game: {
    emptyTitle: "No games found",
    emptyBodyPrefix: "CheapShark had no deals for",
    gradient: "from-indigo-500 to-purple-700",
  },
  anime: {
    emptyTitle: "No anime found",
    emptyBodyPrefix: "Jikan had no results for",
    gradient: "from-fuchsia-500 to-pink-700",
  },
}

function MediaPosterGrid({
  data,
  family,
  className,
}: {
  data: SearchEnvelope
  family: MediaFamily
  className?: string
}) {
  const results = data.results ?? []
  const copy = familyCopy[family]
  if (results.length === 0) {
    return (
      <EmptyState
        className={className}
        title={copy.emptyTitle}
        body={`${copy.emptyBodyPrefix} "${data.query}".`}
      />
    )
  }
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {results.map((r) => (
        <MediaPosterCard
          key={`${r.source}-${r.kind ?? family}-${r.id}`}
          data={r}
          gradient={copy.gradient}
        />
      ))}
    </div>
  )
}

function MediaPosterCard({
  data,
  gradient,
}: {
  data: ProviderResult
  gradient: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.imageUrl}
          alt=""
          loading="lazy"
          className="aspect-[2/3] w-full object-cover"
        />
      ) : (
        <div
          className={cn(
            "aspect-[2/3] w-full bg-gradient-to-br",
            gradient,
          )}
        />
      )}
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-medium">{data.title}</p>
        {data.subtitle && (
          <p className="line-clamp-2 text-[10px] text-muted-foreground">
            {data.subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export function SearchMoviesCard({
  data,
  className,
}: {
  data: SearchEnvelope
  className?: string
}) {
  return <MediaPosterGrid data={data} family="movie" className={className} />
}

export function SearchBooksCard({
  data,
  className,
}: {
  data: SearchEnvelope
  className?: string
}) {
  return <MediaPosterGrid data={data} family="book" className={className} />
}

export function SearchGamesCard({
  data,
  className,
}: {
  data: SearchEnvelope
  className?: string
}) {
  return <MediaPosterGrid data={data} family="game" className={className} />
}

export function SearchAnimeCard({
  data,
  className,
}: {
  data: SearchEnvelope
  className?: string
}) {
  return <MediaPosterGrid data={data} family="anime" className={className} />
}
