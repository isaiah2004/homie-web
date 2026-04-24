"use client"

import * as React from "react"
import { ExternalLinkIcon, MapPinIcon, StarIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type PlaceCardData = {
  id: string
  name: string
  address: string | null
  typeLabel: string | null
  rating: number | null
  ratingCount: number | null
  mapsLink: string | null
  imageUrl: string | null
}

export type SearchPlacesOutput = {
  query: string
  places: PlaceCardData[]
  note?: string
  error?: string
}

export function SearchPlacesCard({
  data,
  className,
}: {
  data: SearchPlacesOutput
  className?: string
}) {
  if (data.note || data.error) {
    return (
      <EmptyState
        className={className}
        title="Place search unavailable"
        body={
          data.error ??
          data.note ??
          "We couldn't reach the places provider right now."
        }
      />
    )
  }
  if (!data.places || data.places.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No places found"
        body={`Nothing matched "${data.query}". Try a different phrasing or include a neighborhood.`}
      />
    )
  }
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {data.places.map((p) => (
        <PlaceCard key={p.id} data={p} />
      ))}
    </div>
  )
}

export function PlaceCard({
  data,
  className,
}: {
  data: PlaceCardData
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.imageUrl}
          alt=""
          loading="lazy"
          className="h-32 w-full object-cover"
        />
      ) : (
        <div className="h-16 w-full bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="truncate text-sm font-medium">{data.name}</h4>
          {data.typeLabel && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {data.typeLabel}
            </Badge>
          )}
        </div>
        {data.address && (
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="size-3 shrink-0 translate-y-0.5" />
            <span className="line-clamp-2">{data.address}</span>
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {data.rating !== null && (
            <span className="inline-flex items-center gap-1">
              <StarIcon className="size-3 fill-amber-400 stroke-amber-500" />
              {data.rating.toFixed(1)}
              {data.ratingCount ? ` (${data.ratingCount})` : ""}
            </span>
          )}
          {data.mapsLink && (
            <a
              href={data.mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              Open in Maps
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
