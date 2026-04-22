"use client"

import * as React from "react"
import Link from "next/link"
import { MapPinIcon, UsersIcon } from "lucide-react"

import type { Doc } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Reusable card used by `/dashboard/communities` (My + Discover tabs) and
// by any other surface that wants to link into a community. `distanceKm`
// is only meaningful in the discover context; omit it on My Communities.
export type CommunityCardProps = {
  community: Doc<"communities">
  distanceKm?: number
  myRole?: "admin" | "moderator" | "announcer" | "member" | null
  pendingRequest?: boolean
  className?: string
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function roleTone(
  role: "admin" | "moderator" | "announcer" | "member",
): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin":
      return "default"
    case "moderator":
    case "announcer":
      return "secondary"
    default:
      return "outline"
  }
}

export function CommunityCard({
  community,
  distanceKm,
  myRole,
  pendingRequest,
  className,
}: CommunityCardProps) {
  return (
    <Link
      href={`/dashboard/communities/${community.slug}`}
      className={cn(
        "group block overflow-hidden rounded-lg border bg-card transition-colors hover:bg-muted/40",
        className,
      )}
    >
      {community.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={community.coverImageUrl}
          alt=""
          className="h-24 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-16 w-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500" />
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {community.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={community.avatarUrl}
              alt=""
              className="size-10 rounded-md border object-cover"
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-md border bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
              {initials(community.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium">{community.name}</h3>
              {community.isPaid && (
                <Badge variant="secondary" className="text-[10px]">
                  Paid
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {community.category}
              </Badge>
              {!community.isPublic && (
                <Badge variant="outline" className="text-[10px]">
                  Private
                </Badge>
              )}
              {myRole && (
                <Badge variant={roleTone(myRole)} className="text-[10px]">
                  {myRole}
                </Badge>
              )}
              {pendingRequest && (
                <Badge variant="outline" className="text-[10px]">
                  Requested
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UsersIcon className="size-3" />
            {community.memberCount} member
            {community.memberCount === 1 ? "" : "s"}
          </span>
          {community.locationLabel && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPinIcon className="size-3" />
              <span className="truncate">{community.locationLabel}</span>
            </span>
          )}
          {distanceKm !== undefined && (
            <span className="ml-auto inline-flex items-center gap-1">
              {distanceKm < 1
                ? `${Math.round(distanceKm * 1000)} m`
                : `${distanceKm.toFixed(1)} km`}{" "}
              away
            </span>
          )}
        </div>
        {community.description && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {community.description}
          </p>
        )}
      </div>
    </Link>
  )
}
