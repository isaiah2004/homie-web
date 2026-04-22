"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  MapPinIcon,
  UsersIcon,
  UserPlusIcon,
  XIcon,
  ExternalLinkIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

function formatRange(startsAt: number, endsAt?: number): string {
  const start = new Date(startsAt)
  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
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
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (sameDay) return `${dateStr} · ${startTime} – ${endTime}`
  const endDate = end.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  return `${dateStr} ${startTime} – ${endDate} ${endTime}`
}

function rsvpBadgeTone(
  status: "pending" | "accepted" | "declined" | "maybe",
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "accepted":
      return "default"
    case "declined":
      return "destructive"
    case "maybe":
      return "secondary"
    case "pending":
      return "outline"
  }
}

export default function Page() {
  const activeUser = useActiveUser()
  const params = useParams<{ id: string }>()
  const eventId = params.id as Id<"events">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const data = useQuery(
    api.events.getEventForViewer,
    skip ? "skip" : { eventId, ...identityArg },
  )
  const invites = useQuery(
    api.eventInvites.listInvitesForEvent,
    skip ? "skip" : { eventId, ...identityArg },
  )

  const respond = useIdentifiedMutation(api.eventInvites.respondToInvite)
  const cancelEvent = useIdentifiedMutation(api.events.cancelEvent)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Event" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="events" />
        </div>
      </PageShell>
    )
  }

  if (data === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Event" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  if (data === null) {
    return (
      <PageShell header={<SiteHeader pageName="Event" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Event unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This event doesn&apos;t exist, was removed, or isn&apos;t visible to you.
              </p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/events">Back to events</Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  const { event, isCreator, invite, creator } = data
  const cancelled = event.status === "cancelled"

  async function handleRespond(response: "accepted" | "declined" | "maybe") {
    if (!invite) return
    try {
      await respond({ inviteId: invite._id, response })
      toast.success(
        response === "accepted"
          ? "You're going"
          : response === "declined"
            ? "Declined"
            : "Marked as maybe",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to respond")
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this event? Invitees will be notified.")) return
    try {
      await cancelEvent({ eventId })
      toast.success("Event cancelled")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel")
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="Event" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/events">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="rounded-lg border bg-card overflow-hidden">
            {event.coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.coverImageUrl}
                alt=""
                className="h-48 w-full object-cover"
              />
            )}
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1
                    className={cn(
                      "text-2xl font-semibold",
                      cancelled && "line-through opacity-70",
                    )}
                  >
                    {event.name}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {event.visibility === "public"
                        ? "Public"
                        : event.visibility === "friends"
                          ? "Friends"
                          : "Invite-only"}
                    </Badge>
                    {cancelled && (
                      <Badge variant="destructive" className="text-[10px]">
                        Cancelled
                      </Badge>
                    )}
                    {isCreator && (
                      <Badge variant="secondary" className="text-[10px]">
                        Hosting
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {isCreator && !cancelled && (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/events/${event._id}/invite`}>
                          <UserPlusIcon className="size-4" />
                          Invite
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleCancel}
                      >
                        <XIcon className="size-4" />
                        Cancel event
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CalendarClockIcon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <span>{formatRange(event.startsAt, event.endsAt)}</span>
                </div>
                {(event.locationName ||
                  event.locationAddress ||
                  event.locationMapsLink) && (
                  <div className="flex items-start gap-2">
                    <MapPinIcon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                    <div className="min-w-0">
                      {event.locationName && (
                        <p className="font-medium">{event.locationName}</p>
                      )}
                      {event.locationAddress && (
                        <p className="text-muted-foreground">
                          {event.locationAddress}
                        </p>
                      )}
                      {event.locationMapsLink && (
                        <a
                          href={event.locationMapsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Open in Maps
                          <ExternalLinkIcon className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {creator && (
                  <div className="flex items-start gap-2">
                    <UsersIcon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">
                      Hosted by {creator.name}
                    </span>
                  </div>
                )}
              </div>

              {event.description && (
                <>
                  <Separator className="my-4" />
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {event.description}
                  </div>
                </>
              )}

              {/* RSVP controls for invited viewers */}
              {!isCreator && invite && !cancelled && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Your RSVP</h3>
                      <Badge variant={rsvpBadgeTone(invite.status)}>
                        {invite.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={
                          invite.status === "accepted" ? "default" : "outline"
                        }
                        onClick={() => handleRespond("accepted")}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          invite.status === "maybe" ? "default" : "outline"
                        }
                        onClick={() => handleRespond("maybe")}
                      >
                        Maybe
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          invite.status === "declined"
                            ? "destructive"
                            : "outline"
                        }
                        onClick={() => handleRespond("declined")}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Invitee list — creator only */}
              {isCreator && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <h3 className="text-sm font-semibold">Invitees</h3>
                    <div className="mt-2 space-y-1">
                      {invites === undefined ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                      ) : invites.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No invites yet.{" "}
                          <Link
                            href={`/dashboard/events/${event._id}/invite`}
                            className="text-primary hover:underline"
                          >
                            Invite friends
                          </Link>
                          .
                        </p>
                      ) : (
                        <ul className="divide-y rounded-md border">
                          {invites.map((row) => (
                            <li
                              key={row.invite._id}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <span className="truncate">
                                {row.user?.name ?? "Unknown user"}
                                {row.user?.username && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    @{row.user.username}
                                  </span>
                                )}
                              </span>
                              <Badge variant={rsvpBadgeTone(row.invite.status)}>
                                {row.invite.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
