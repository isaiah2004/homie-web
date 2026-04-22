"use client"

import * as React from "react"
import {
  Calendar,
  dateFnsLocalizer,
  type View,
  type Event as RbcEvent,
} from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { enUS } from "date-fns/locale/en-US"
import "react-big-calendar/lib/css/react-big-calendar.css"
import "@/components/ui/calendar-overrides.css"

import { cn } from "@/lib/utils"

const locales = { "en-US": enUS }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

// Narrow shape our page feeds in. Mirrors the Convex event row plus a
// precomputed `isMine` flag (done server-side from `listEventsForCalendar`).
export type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  status: "scheduled" | "cancelled" | "completed"
  isMine: boolean
}

type Props = {
  events: CalendarEvent[]
  onSelectEvent?: (event: CalendarEvent) => void
  view?: View
  onViewChange?: (view: View) => void
  date?: Date
  onNavigate?: (date: Date) => void
  className?: string
}

export function EventCalendar({
  events,
  onSelectEvent,
  view,
  onViewChange,
  date,
  onNavigate,
  className,
}: Props) {
  // react-big-calendar calls this for every rendered event — returns classes
  // that the CSS override file styles based on status + ownership. Memoized
  // so reference identity is stable per render (the calendar uses it in
  // its own memo'd children).
  const eventPropGetter = React.useCallback(
    (event: RbcEvent) => {
      const e = event as CalendarEvent
      const classes: string[] = []
      if (e.status === "cancelled") classes.push("event-cancelled")
      else if (e.isMine) classes.push("event-mine")
      return { className: classes.join(" ") }
    },
    [],
  )

  return (
    <div className={cn("h-[640px]", className)}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        defaultView="month"
        views={["month", "week", "day", "agenda"]}
        view={view}
        onView={onViewChange}
        date={date}
        onNavigate={onNavigate}
        onSelectEvent={(ev) => onSelectEvent?.(ev as CalendarEvent)}
        eventPropGetter={eventPropGetter}
        popup
        style={{ height: "100%" }}
      />
    </div>
  )
}
