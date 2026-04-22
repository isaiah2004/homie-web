"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { CalendarDaysIcon, ListIcon, MailIcon, PlusIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { View } from "react-big-calendar"
import { EventCalendar, type CalendarEvent } from "@/components/event-calendar"

// Convex returns `{ event, isMine }` rows from both list queries we use here;
// centralising the type keeps render paths honest.
type EventRow = {
  event: Doc<"events">
  isMine: boolean
}

function startOfCalendarRange(view: View, anchor: Date): Date {
  const d = new Date(anchor)
  if (view === "day") {
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (view === "week") {
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (view === "agenda") {
    d.setHours(0, 0, 0, 0)
    return d
  }
  // month
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  // Month grid can show 6 full weeks — back off to prev week's Sunday.
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d
}

function endOfCalendarRange(view: View, anchor: Date): Date {
  const d = startOfCalendarRange(view, anchor)
  if (view === "day") {
    d.setDate(d.getDate() + 1)
    return d
  }
  if (view === "week") {
    d.setDate(d.getDate() + 7)
    return d
  }
  if (view === "agenda") {
    d.setDate(d.getDate() + 30)
    return d
  }
  // Month grid — 6 weeks.
  d.setDate(d.getDate() + 42)
  return d
}

function formatEventListDate(startsAt: number, endsAt?: number): string {
  const start = new Date(startsAt)
  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (!endsAt) return `${dateStr} · ${startTime}`
  const end = new Date(endsAt)
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${dateStr} · ${startTime} – ${endTime}`
}

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()

  const [calView, setCalView] = React.useState<View>("month")
  const [calDate, setCalDate] = React.useState<Date>(() => new Date())

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded

  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  // Calendar range for the selected view, expanded slightly so navigation
  // doesn't cause a re-fetch every arrow click.
  const calRange = React.useMemo(() => {
    const from = startOfCalendarRange(calView, calDate).getTime()
    const to = endOfCalendarRange(calView, calDate).getTime()
    return { from, to }
  }, [calView, calDate])

  const calendarEventsData = useQuery(
    api.events.listEventsForCalendar,
    skip ? "skip" : { from: calRange.from, to: calRange.to, ...identityArg },
  )
  const myEvents = useQuery(
    api.events.listMyEvents,
    skip ? "skip" : identityArg,
  )
  const pendingInvites = useQuery(
    api.eventInvites.listPendingInvitesForMe,
    skip ? "skip" : identityArg,
  )

  const respond = useIdentifiedMutation(api.eventInvites.respondToInvite)

  const calendarEvents: CalendarEvent[] = React.useMemo(() => {
    return (calendarEventsData ?? []).map((row: EventRow) => ({
      id: row.event._id,
      title: row.event.name,
      start: new Date(row.event.startsAt),
      end: new Date(
        row.event.endsAt ?? row.event.startsAt + 60 * 60 * 1000,
      ),
      status: row.event.status,
      isMine: row.isMine,
    }))
  }, [calendarEventsData])

  // Cutoff is kept in state so Date.now() stays out of render. The page is
  // unlikely to live long enough for this to drift, but we refresh it every
  // minute so "upcoming" stays honest for a tab left open.
  const [now, setNow] = React.useState<number>(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const upcoming = React.useMemo(() => {
    return (myEvents ?? []).filter((r: EventRow) => {
      const endOrStart = r.event.endsAt ?? r.event.startsAt
      return endOrStart >= now && r.event.status !== "cancelled"
    })
  }, [myEvents, now])

  async function handleRespond(
    inviteId: Id<"eventInvites">,
    response: "accepted" | "declined" | "maybe",
  ) {
    try {
      await respond({ inviteId, response })
      const msg =
        response === "accepted"
          ? "You're going"
          : response === "declined"
            ? "RSVP declined"
            : "Marked as maybe"
      toast.success(msg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to respond")
    }
  }

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Events" />
        <PickDevUserEmptyState pageName="events" />
      </div>
    )
  }

  return (
    <div>
      <SiteHeader pageName="Events" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Your events</h2>
              <p className="text-sm text-muted-foreground">
                Plan hangouts, RSVP to invites, and see what&apos;s coming up.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/events/new">
                <PlusIcon className="size-4" />
                New Event
              </Link>
            </Button>
          </div>

          <Tabs defaultValue="calendar" className="flex-1">
            <TabsList>
              <TabsTrigger value="calendar">
                <CalendarDaysIcon className="size-4 mr-1" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="list">
                <ListIcon className="size-4 mr-1" />
                List
              </TabsTrigger>
              <TabsTrigger value="invites">
                <MailIcon className="size-4 mr-1" />
                Invites
                {pendingInvites && pendingInvites.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingInvites.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="mt-4">
              <div className="rounded-lg border bg-card p-4">
                <EventCalendar
                  events={calendarEvents}
                  view={calView}
                  onViewChange={setCalView}
                  date={calDate}
                  onNavigate={setCalDate}
                  onSelectEvent={(ev) =>
                    router.push(`/dashboard/events/${ev.id}`)
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="list" className="mt-4">
              <div className="space-y-2">
                {myEvents === undefined ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : upcoming.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <p className="text-sm font-medium">No upcoming events</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create one or wait for a friend to invite you.
                    </p>
                    <Button className="mt-3" size="sm" asChild>
                      <Link href="/dashboard/events/new">
                        <PlusIcon className="size-3.5 mr-1" />
                        New Event
                      </Link>
                    </Button>
                  </div>
                ) : (
                  upcoming.map((row: EventRow) => (
                    <Link
                      key={row.event._id}
                      href={`/dashboard/events/${row.event._id}`}
                      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate font-medium">
                              {row.event.name}
                            </h4>
                            {row.isMine && (
                              <Badge variant="secondary" className="text-[10px]">
                                Hosting
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {row.event.visibility}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatEventListDate(
                              row.event.startsAt,
                              row.event.endsAt,
                            )}
                          </p>
                          {row.event.locationName && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.event.locationName}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="invites" className="mt-4">
              <div className="space-y-2">
                {pendingInvites === undefined ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : pendingInvites.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <p className="text-sm font-medium">No pending invites</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      When someone invites you, you&apos;ll be able to RSVP here.
                    </p>
                  </div>
                ) : (
                  pendingInvites.map((row) =>
                    row.event ? (
                      <div
                        key={row.invite._id}
                        className="rounded-lg border bg-card p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/dashboard/events/${row.event._id}`}
                              className="block"
                            >
                              <h4 className="truncate font-medium">
                                {row.event.name}
                              </h4>
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatEventListDate(
                                row.event.startsAt,
                                row.event.endsAt,
                              )}
                            </p>
                            {row.event.locationName && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.event.locationName}
                              </p>
                            )}
                            {row.inviter && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Invited by {row.inviter.name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              handleRespond(row.invite._id, "accepted")
                            }
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleRespond(row.invite._id, "maybe")
                            }
                          >
                            Maybe
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleRespond(row.invite._id, "declined")
                            }
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ) : null,
                  )
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
