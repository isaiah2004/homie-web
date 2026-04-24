"use client"

import {
  BookOpenIcon,
  ExternalLinkIcon,
  FilmIcon,
  FolderGit2Icon,
  GamepadIcon,
  HeartIcon,
  LightbulbIcon,
  MapPinIcon,
  MusicIcon,
  StarIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

// Cards for the embedding-search tools on the `agentTools.ts` side —
// `findFriendMedia`, `findFriendPlaces`, `findFriendProjects`,
// `findFriendInterests`. All four return a flat array of hits rather than
// the `{items: [...]}` shape the newer tools use, so each card's `data`
// prop is the raw array the tool returns.

// ─── findFriendMedia ─────────────────────────────────────────────────────────

export type FriendMediaRow = {
  title: string
  mediaType?: string | null
  recommendedBy?: string | null
  imageUrl?: string | null
  subtitle?: string | null
  externalSource?: string | null
  score?: number | null
}

function mediaTypeIcon(mediaType?: string | null) {
  switch ((mediaType ?? "").toLowerCase()) {
    case "music":
      return MusicIcon
    case "movie":
    case "series":
      return FilmIcon
    case "book":
    case "novel":
      return BookOpenIcon
    case "game":
      return GamepadIcon
    case "anime":
      return FilmIcon
    default:
      return StarIcon
  }
}

export function FriendMediaCard({
  data,
  className,
}: {
  data: FriendMediaRow[]
  className?: string
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No matches"
        body="None of your friends' media items matched that query. Try a broader term or ask them to add more items to their profile."
      />
    )
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      {data.map((row, i) => {
        const Icon = mediaTypeIcon(row.mediaType)
        return (
          <div
            key={`${row.title}-${i}`}
            className="flex items-start gap-3 rounded-md border bg-card px-3 py-2"
          >
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.imageUrl}
                alt={row.title}
                className="size-12 shrink-0 rounded object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted">
                <Icon className="size-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.title}</p>
              {row.subtitle ? (
                <p className="truncate text-xs text-muted-foreground">
                  {row.subtitle}
                </p>
              ) : null}
              <p className="truncate text-[11px] text-muted-foreground">
                {row.mediaType ? (
                  <>
                    <span className="capitalize">{row.mediaType}</span>
                    {row.recommendedBy ? " · " : ""}
                  </>
                ) : null}
                {row.recommendedBy ? `from ${row.recommendedBy}` : null}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── findFriendPlaces ────────────────────────────────────────────────────────

export type FriendPlacesRow = {
  name: string
  placeType?: string | null
  tags?: string[] | null
  mapsLink?: string | null
  address?: string | null
  imageUrl?: string | null
  // Canonical "primary type" from Google Places (e.g. "Pizza Restaurant")
  // when the tool enriched this place; falls back to the user's own
  // `placeType` tag when missing.
  typeLabel?: string | null
  rating?: number | null
  recommendedBy?: string | null
  ownerLocation?: string | null
  score?: number | null
}

export function FriendPlacesCard({
  data,
  className,
}: {
  data: FriendPlacesRow[]
  className?: string
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No places matched"
        body="None of your friends have saved a place matching that query. Try a different phrasing or include a neighborhood."
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
      {data.map((row, i) => (
        <FriendPlaceCard key={`${row.name}-${i}`} row={row} />
      ))}
    </div>
  )
}

function FriendPlaceCard({ row }: { row: FriendPlacesRow }) {
  // Prefer the canonical Google type label when the server enriched the
  // place (e.g. "Pizza Restaurant"); fall back to the user's coarse
  // category (e.g. "restaurant").
  const typeText = row.typeLabel || row.placeType || null
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="relative">
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt={row.name}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-sky-500 to-indigo-700 text-white">
            <MapPinIcon className="size-8 opacity-80" />
          </div>
        )}
        {typeof row.rating === "number" ? (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <StarIcon className="size-2.5 fill-amber-300 text-amber-300" />
            {row.rating.toFixed(1)}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p
          className="line-clamp-2 text-xs font-medium leading-tight"
          title={row.name}
        >
          {row.name}
        </p>
        {typeText ? (
          <p
            className="line-clamp-1 text-[10px] text-muted-foreground capitalize"
            title={typeText}
          >
            {typeText}
          </p>
        ) : null}
        {row.address ? (
          <p
            className="line-clamp-2 text-[10px] text-muted-foreground"
            title={row.address}
          >
            {row.address}
          </p>
        ) : null}
        {row.recommendedBy ? (
          <p
            className="mt-auto truncate pt-1 text-[10px] text-muted-foreground"
            title={`from ${row.recommendedBy}`}
          >
            from {row.recommendedBy}
          </p>
        ) : null}
      </div>
      {row.mapsLink ? (
        <a
          href={row.mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t bg-muted/30 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={`Open ${row.name} in Google Maps`}
        >
          <ExternalLinkIcon className="size-3" />
          Open in Maps
        </a>
      ) : null}
    </div>
  )
}

// ─── findFriendProjects ──────────────────────────────────────────────────────

export type FriendProjectsRow = {
  title: string
  description?: string | null
  tags?: string[] | null
  ownerName?: string | null
  score?: number | null
}

export function FriendProjectsCard({
  data,
  className,
}: {
  data: FriendProjectsRow[]
  className?: string
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No projects matched"
        body="None of your friends have a project tagged like that. Try a broader topic, or add more friends."
      />
    )
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      {data.map((row, i) => (
        <div
          key={`${row.title}-${i}`}
          className="flex items-start gap-3 rounded-md border bg-card px-3 py-2"
        >
          <FolderGit2Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.title}</p>
            {row.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {row.description}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {(row.tags ?? []).slice(0, 5).map((t, ti) => (
                <Badge
                  key={`${row.title}-tag-${ti}`}
                  variant="outline"
                  className="text-[10px]"
                >
                  {t}
                </Badge>
              ))}
              {row.ownerName ? (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  by {row.ownerName}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── findFriendInterests ─────────────────────────────────────────────────────

export type FriendInterestsRow = {
  interest: string
  ownerName?: string | null
  score?: number | null
}

export function FriendInterestsCard({
  data,
  className,
}: {
  data: FriendInterestsRow[]
  className?: string
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No interests matched"
        body="None of your friends list that interest. Try a more common phrasing."
      />
    )
  }
  // Group by owner so a friend who's tagged with 5 related interests shows
  // once with a chip row, instead of 5 separate rows.
  const byOwner = new Map<string, FriendInterestsRow[]>()
  for (const row of data) {
    const key = row.ownerName ?? "Unknown"
    const bucket = byOwner.get(key) ?? []
    bucket.push(row)
    byOwner.set(key, bucket)
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      {[...byOwner.entries()].map(([owner, rows]) => (
        <div
          key={owner}
          className="flex items-start gap-3 rounded-md border bg-card px-3 py-2"
        >
          {owner === "Unknown" ? (
            <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <HeartIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{owner}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {rows.map((r, i) => (
                <Badge
                  key={`${owner}-${i}`}
                  variant="outline"
                  className="text-[10px]"
                >
                  {r.interest}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

