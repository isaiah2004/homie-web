"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  MapPinIcon,
  UsersIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import {
  useIdentifiedMutation,
  useIdentifiedQuery,
} from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import {
  PageShell,
  ResizeHandle,
  useResizableWidth,
} from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LobbyChatPanel } from "@/components/event-room/LobbyChatPanel"
import { EventStorePanel } from "@/components/event-room/EventStorePanel"
import { AutoMatchPanel } from "@/components/event-room/AutoMatchPanel"

function formatRange(startsAt: number, endsAt?: number): string {
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
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (sameDay) return `${dateStr} · ${startTime} – ${endTime}`
  const endDate = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  return `${dateStr} ${startTime} – ${endDate} ${endTime}`
}

export default function LobbyPage() {
  const activeUser = useActiveUser()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const eventId = params.id as Id<"events">
  const joinToken = searchParams.get("join")

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded

  // In dev mode the viewer's Convex id is the seeded user id from the
  // switcher. In prod we resolve via getOrCreateUser keyed on Clerk email
  // — same pattern used by GroupPane / DmPane / event invite page.
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)
  React.useEffect(() => {
    if (activeUser.isDevMode) {
      setViewerId(activeUser.devUserId)
      return
    }
    if (!activeUser.email) return
    getOrCreateUser({
      email: activeUser.email,
      username: activeUser.username ?? undefined,
      name: activeUser.fullName ?? undefined,
    })
      .then((id) => setViewerId(id as Id<"users">))
      .catch((err) => {
        console.error(err)
        toast.error("Failed to sync your account")
      })
  }, [
    activeUser.isDevMode,
    activeUser.devUserId,
    activeUser.email,
    activeUser.username,
    activeUser.fullName,
    getOrCreateUser,
  ])

  const room = useIdentifiedQuery(
    api.eventRooms.getRoomForViewer,
    skip ? "skip" : { eventId },
  )

  // Bare useMutation here because joinEventRoom takes a shareToken (not an
  // event id) and we need to forward devUserId manually. The identified
  // helpers can't compose with optional dev injection cleanly when the
  // first call is fire-once on mount.
  const joinRoom = useMutation(api.eventRooms.joinEventRoom)
  const requestCommunityJoin = useIdentifiedMutation(
    api.communityMembers.requestJoin,
  )
  const generateShareLink = useIdentifiedMutation(
    api.eventRooms.generateShareLink,
  )
  const revokeShareLink = useIdentifiedMutation(
    api.eventRooms.revokeShareLink,
  )
  const leaveLobby = useIdentifiedMutation(api.eventRooms.leaveEventRoom)

  const joinAttemptedRef = React.useRef(false)
  React.useEffect(() => {
    if (skip) return
    if (!joinToken) return
    if (joinAttemptedRef.current) return
    if (room === undefined) return
    if (room && room.isMember) {
      // Already a member — strip the param so a refresh doesn't re-attempt.
      router.replace(`/dashboard/events/${eventId}/lobby`)
      return
    }
    joinAttemptedRef.current = true
    const args =
      activeUser.isDevMode && activeUser.devUserId
        ? { shareToken: joinToken, devUserId: activeUser.devUserId }
        : { shareToken: joinToken }
    joinRoom(args)
      .then(() => {
        router.replace(`/dashboard/events/${eventId}/lobby`)
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Could not join the lobby",
        )
      })
  }, [
    skip,
    joinToken,
    joinRoom,
    eventId,
    router,
    room,
    activeUser.isDevMode,
    activeUser.devUserId,
  ])

  const rightRail = useResizableWidth({
    initial: 380,
    min: 300,
    max: 640,
    side: "left",
  })

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Lobby" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="event lobbies" />
        </div>
      </PageShell>
    )
  }

  if (room === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Lobby" />}>
        <div className="flex-1 p-6 text-sm text-muted-foreground">Loading…</div>
      </PageShell>
    )
  }

  if (room === null) {
    return (
      <PageShell header={<SiteHeader pageName="Lobby" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Lobby unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This event doesn&apos;t exist or isn&apos;t visible to you.
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

  if (!room.isMember && !joinToken) {
    return (
      <PageShell header={<SiteHeader pageName="Lobby" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">You&apos;re not in this lobby</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask the host for a share link to join.
              </p>
              <Button asChild className="mt-4">
                <Link href={`/dashboard/events/${eventId}`}>
                  <ArrowLeftIcon className="size-4" />
                  Back to event
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  const { event, isHost, memberCount, communityInfo, roomEnabled } = room

  async function handleCopyShareLink() {
    try {
      const { shareToken } = await generateShareLink({ eventId })
      const url = `${window.location.origin}/dashboard/events/${eventId}/lobby?join=${shareToken}`
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy link")
    }
  }

  async function handleRevokeShareLink() {
    if (!confirm("Revoke the lobby share link? Existing members keep access.")) {
      return
    }
    try {
      await revokeShareLink({ eventId })
      toast.success("Share link revoked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke")
    }
  }

  async function handleCommunityJoin() {
    if (!communityInfo) return
    try {
      await requestCommunityJoin({ communityId: communityInfo.communityId })
      toast.success(`Requested to join ${communityInfo.communityName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request")
    }
  }

  async function handleLeave() {
    if (!confirm("Leave this lobby? You can rejoin via the share link.")) return
    try {
      await leaveLobby({ eventId })
      toast.success("Left lobby")
      router.push(`/dashboard/events/${eventId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave")
    }
  }

  return (
    <PageShell header={<SiteHeader pageName={event.name} />}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Lobby header */}
        <div className="shrink-0 border-b bg-background">
          {event.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt=""
              className="h-32 w-full object-cover"
            />
          )}
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/dashboard/events/${eventId}`}>
                    <ArrowLeftIcon className="size-4" />
                    Event
                  </Link>
                </Button>
                <h1 className="text-lg font-semibold">{event.name}</h1>
                {isHost && (
                  <Badge variant="secondary" className="text-[10px]">
                    Hosting
                  </Badge>
                )}
                {!roomEnabled && (
                  <Badge variant="destructive" className="text-[10px]">
                    Closed
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarClockIcon className="size-3.5" />
                  {formatRange(event.startsAt, event.endsAt)}
                </span>
                {event.locationName && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="size-3.5" />
                    {event.locationName}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <UsersIcon className="size-3.5" />
                  {memberCount} in lobby
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {communityInfo &&
                (communityInfo.isViewerMember ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/dashboard/communities/${communityInfo.communitySlug}`}
                    >
                      View {communityInfo.communityName}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCommunityJoin}
                  >
                    Join {communityInfo.communityName}
                  </Button>
                ))}
              {isHost && roomEnabled && (
                <>
                  <Button size="sm" onClick={handleCopyShareLink}>
                    Copy share link
                  </Button>
                  {event.shareToken && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRevokeShareLink}
                    >
                      Revoke link
                    </Button>
                  )}
                </>
              )}
              {!isHost && (
                <Button size="sm" variant="ghost" onClick={handleLeave}>
                  Leave lobby
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            {viewerId ? (
              <LobbyChatPanel
                eventId={eventId}
                viewerId={viewerId}
                roomEnabled={roomEnabled}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Sign-in required for production lobby chat (dev mode uses the switcher).
              </div>
            )}
          </div>
          <ResizeHandle
            onMouseDown={rightRail.onMouseDown}
            label="Resize lobby panel"
          />
          <div
            className="flex min-h-0 shrink-0 flex-col border-l bg-background"
            style={{ width: `${rightRail.width}px` }}
          >
            <Tabs defaultValue="store" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="m-2 grid grid-cols-2">
                <TabsTrigger value="store">Store</TabsTrigger>
                <TabsTrigger value="match">Auto-match</TabsTrigger>
              </TabsList>
              <TabsContent
                value="store"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {viewerId ? (
                  <EventStorePanel eventId={eventId} viewerId={viewerId} />
                ) : null}
              </TabsContent>
              <TabsContent
                value="match"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {viewerId ? (
                  <AutoMatchPanel eventId={eventId} viewerId={viewerId} />
                ) : null}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
