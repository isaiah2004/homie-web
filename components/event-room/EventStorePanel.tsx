"use client"

import * as React from "react"

import type { Id } from "@/convex/_generated/dataModel"

export function EventStorePanel({
  eventId: _eventId,
  viewerId: _viewerId,
}: {
  eventId: Id<"events">
  viewerId: Id<"users">
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
      Roster coming soon
    </div>
  )
}
