"use client"

import * as React from "react"

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
// Songs (Spotify) — includes an inline iframe embed for track results so the
// user can listen without leaving the chat.
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
    <div className={cn("space-y-3", className)}>
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
  const embedSrc =
    data.source === "spotify" && data.kind
      ? `https://open.spotify.com/embed/${data.kind}/${data.id}`
      : null
  return (
    <div
      className={cn("overflow-hidden rounded-lg border bg-card", className)}
    >
      <div className="flex items-start gap-3 p-3">
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.imageUrl}
            alt=""
            loading="lazy"
            className="size-14 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="size-14 shrink-0 rounded-md bg-gradient-to-br from-green-500 to-emerald-700" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{data.title}</p>
            {data.kind && (
              <Badge variant="outline" className="text-[10px]">
                {data.kind}
              </Badge>
            )}
          </div>
          {data.subtitle && (
            <p className="truncate text-xs text-muted-foreground">
              {data.subtitle}
            </p>
          )}
        </div>
      </div>
      {embedSrc && (
        <iframe
          title={data.title}
          src={embedSrc}
          // Track gets a compact player; albums/artists take more vertical
          // room (352 matches Spotify's default).
          style={{ height: data.kind === "track" ? 80 : 352 }}
          className="block w-full"
          allow="encrypted-media"
        />
      )}
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
