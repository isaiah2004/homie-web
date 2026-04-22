"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { CalendarClockIcon, MapPinIcon, UsersIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

function formatEventDate(startsAt: number, endsAt?: number): string {
  const start = new Date(startsAt)
  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (!endsAt) return `${dateStr} · ${startTime}`
  const end = new Date(endsAt)
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  if (sameDay) {
    const endTime = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
    return `${dateStr} · ${startTime} – ${endTime}`
  }
  const endDate = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  return `${dateStr} – ${endDate}`
}

function visibilityLabel(
  v: "public" | "friends" | "invitees",
): { label: string; tone: "default" | "secondary" | "outline" } {
  switch (v) {
    case "public":
      return { label: "Public", tone: "default" }
    case "friends":
      return { label: "Friends", tone: "secondary" }
    case "invitees":
      return { label: "Invite-only", tone: "outline" }
  }
}

// Reusable card that fetches the event via the viewer-aware query. If the
// viewer isn't allowed to see the event (returns null), renders an opaque
// fallback rather than leaking existence ("Event unavailable").
export function EventCard({
  eventId,
  className,
}: {
  eventId: Id<"events">
  className?: string
}) {
  const { devUserId, isDevMode, isLoaded } = useActiveUser()
  const skip = isDevMode ? !devUserId : !isLoaded
  const data = useQuery(
    api.events.getEventForViewer,
    skip ? "skip" : { eventId, ...(isDevMode && devUserId ? { devUserId } : {}) },
  )

  if (data === undefined) {
    return (
      <div
        className={cn(
          "rounded-md border bg-card p-3 text-sm text-muted-foreground",
          className,
        )}
      >
        Loading event…
      </div>
    )
  }
  if (data === null) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed bg-card p-3 text-sm text-muted-foreground",
          className,
        )}
      >
        Event unavailable
      </div>
    )
  }

  const { event } = data
  const vis = visibilityLabel(event.visibility)
  const cancelled = event.status === "cancelled"

  return (
    <Link
      href={`/dashboard/events/${event._id}`}
      className={cn(
        "group block rounded-md border bg-card p-3 transition-colors hover:bg-muted/40",
        cancelled && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              className={cn(
                "truncate text-sm font-medium",
                cancelled && "line-through",
              )}
            >
              {event.name}
            </h4>
            <Badge
              variant={vis.tone === "default" ? "default" : "outline"}
              className="text-[10px]"
            >
              {vis.label}
            </Badge>
            {cancelled && (
              <Badge variant="destructive" className="text-[10px]">
                Cancelled
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClockIcon className="size-3 shrink-0" />
            <span className="truncate">
              {formatEventDate(event.startsAt, event.endsAt)}
            </span>
          </div>
          {event.locationName && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPinIcon className="size-3 shrink-0" />
              <span className="truncate">{event.locationName}</span>
            </div>
          )}
          {data.creator && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <UsersIcon className="size-3 shrink-0" />
              <span className="truncate">by {data.creator.name}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
