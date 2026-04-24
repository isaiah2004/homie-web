"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarClockIcon, MapPinIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type EventRsvpSummary = {
  event: {
    _id: string
    name: string
    startsAt: number
    endsAt: number | null
    locationName: string | null
    status: "scheduled" | "cancelled" | "completed"
  }
  isCreator: boolean
  myRsvp: "pending" | "accepted" | "declined" | "maybe" | null
  counts: {
    total: number
    accepted: number
    declined: number
    maybe: number
    pending: number
  }
  attendees: Array<{
    userId: string
    name: string
    username: string | null
    avatar: string | null
    status: "pending" | "accepted" | "declined" | "maybe"
  }>
}

export type EventRsvpToolOutput =
  | EventRsvpSummary
  | { eventId: string; error: string }

function formatDate(startsAt: number, endsAt: number | null): string {
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
  return `${dateStr} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`
}

export function EventRsvpCard({
  data,
  className,
}: {
  data: EventRsvpToolOutput
  className?: string
}) {
  if ("error" in data) {
    return (
      <EmptyState
        className={className}
        title="Can't read that event"
        body="It may have been deleted, or you don't have access to its RSVP list."
      />
    )
  }
  const { event, counts, attendees, myRsvp, isCreator } = data
  return (
    <Link
      href={`/dashboard/events/${event._id}`}
      className={cn(
        "block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold">{event.name}</h4>
            {event.status === "cancelled" && (
              <Badge variant="destructive" className="text-[10px]">
                Cancelled
              </Badge>
            )}
            {isCreator && (
              <Badge variant="secondary" className="text-[10px]">
                Your event
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClockIcon className="size-3" />
            <span>{formatDate(event.startsAt, event.endsAt)}</span>
          </div>
          {event.locationName && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPinIcon className="size-3" />
              <span className="truncate">{event.locationName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <Stat label="Going" value={counts.accepted} tone="positive" />
        <Stat label="Maybe" value={counts.maybe} />
        <Stat label="Declined" value={counts.declined} />
        <Stat label="Pending" value={counts.pending} />
      </div>

      {myRsvp && (
        <p className="mt-2 text-xs text-muted-foreground">
          You: <span className="font-medium text-foreground">{myRsvp}</span>
        </p>
      )}

      {attendees.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            {isCreator ? "Everyone invited" : "Going"}
          </p>
          <div className="flex flex-wrap gap-2">
            {attendees.map((a) => (
              <div
                key={a.userId}
                className="flex items-center gap-2 rounded-md border bg-background px-2 py-1"
                title={`${a.name} — ${a.status}`}
              >
                <Avatar className="size-5">
                  <AvatarImage src={a.avatar ?? undefined} alt={a.name} />
                  <AvatarFallback className="text-[9px]">
                    {a.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px]">{a.name}</span>
                {a.status !== "accepted" && isCreator && (
                  <span className="text-[10px] text-muted-foreground">
                    {a.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Link>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "positive"
}) {
  return (
    <div className="rounded-md border bg-background py-1.5">
      <p
        className={cn(
          "text-sm font-semibold",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
