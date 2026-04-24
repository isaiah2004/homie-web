"use client"

import * as React from "react"

import type { Doc, Id } from "@/convex/_generated/dataModel"
import { EventCard } from "@/components/event-card"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type UpcomingEventsOutput = {
  events: Array<{
    event: Doc<"events">
    isMine: boolean
  }>
}

// Renders the tool result for `listMyUpcomingEvents`. Uses the existing
// viewer-aware <EventCard> so visibility gating + cancelled-state styling
// matches the rest of the app — we pass the id, and the card re-fetches
// with the current viewer's identity.
export function UpcomingEventsCard({
  data,
  className,
}: {
  data: UpcomingEventsOutput
  className?: string
}) {
  if (!data.events || data.events.length === 0) {
    return (
      <EmptyState
        className={className}
        title="Nothing on the calendar"
        body="No upcoming events in this window."
      />
    )
  }
  return (
    <div className={cn("space-y-2", className)}>
      {data.events.map(({ event }) => (
        <EventCard key={event._id} eventId={event._id as Id<"events">} />
      ))}
    </div>
  )
}
