"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CheckIcon,
  MegaphoneIcon,
  MinusCircleIcon,
  MoreHorizontalIcon,
  XIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type CommunityRole = "admin" | "moderator" | "announcer" | "member"
const ASSIGNABLE_ROLES: CommunityRole[] = [
  "admin",
  "moderator",
  "announcer",
  "member",
]

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export default function Page() {
  const activeUser = useActiveUser()
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const community = useQuery(
    api.communities.getCommunityBySlug,
    skip ? "skip" : { slug },
  )
  const viewerData = useQuery(
    api.communities.getCommunityForViewer,
    skip || !community
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const isAdmin =
    viewerData !== undefined &&
    viewerData !== null &&
    viewerData.myRole === "admin"

  const requests = useQuery(
    api.communityMembers.listPendingRequests,
    skip || !community || !isAdmin
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const members = useQuery(
    api.communityMembers.listMembers,
    skip || !community || !isAdmin
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const events = useQuery(
    api.events.listEventsForCommunity,
    skip || !community || !isAdmin
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )

  const acceptRequest = useIdentifiedMutation(
    api.communityMembers.acceptJoinRequest,
  )
  const declineRequest = useIdentifiedMutation(
    api.communityMembers.declineJoinRequest,
  )
  const removeMember = useIdentifiedMutation(
    api.communityMembers.removeMember,
  )
  const updateRole = useIdentifiedMutation(
    api.communityMembers.updateMemberRole,
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Manage community" />
        <PickDevUserEmptyState pageName="communities" />
      </div>
    )
  }

  if (community === undefined || viewerData === undefined) {
    return (
      <div>
        <SiteHeader pageName="Manage community" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }
  if (community === null || viewerData === null) {
    return (
      <div>
        <SiteHeader pageName="Manage community" />
        <NotAllowed />
      </div>
    )
  }
  if (!isAdmin) {
    return (
      <div>
        <SiteHeader pageName="Manage community" />
        <NotAllowed />
      </div>
    )
  }

  async function handleAccept(requestId: Id<"communityJoinRequests">) {
    try {
      await acceptRequest({ requestId })
      toast.success("Member added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleDecline(requestId: Id<"communityJoinRequests">) {
    try {
      await declineRequest({ requestId })
      toast.success("Request declined")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleRemove(userId: Id<"users">, name: string) {
    if (!community) return
    if (!confirm(`Remove ${name} from ${community.name}?`)) return
    try {
      await removeMember({
        communityId: community._id,
        targetUserId: userId,
      })
      toast.success(`Removed ${name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleUpdateRole(
    userId: Id<"users">,
    newRole: CommunityRole,
  ) {
    if (!community) return
    try {
      await updateRole({
        communityId: community._id,
        targetUserId: userId,
        newRole,
      })
      toast.success("Role updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <div>
      <SiteHeader pageName="Manage community" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/communities/${slug}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-base font-semibold">
              Manage {community.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Admin-only controls.
            </p>
          </div>

          <Tabs defaultValue="requests" className="mt-4">
            <TabsList className="self-start">
              <TabsTrigger value="requests">
                Requests
                {requests && requests.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {requests.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="ads">Ads</TabsTrigger>
            </TabsList>

            <TabsContent value="requests" className="mt-4">
              <div className="rounded-lg border bg-card">
                {requests === undefined ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : requests.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No pending requests.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {requests.map(({ request, user }) => (
                      <li
                        key={request._id}
                        className="flex items-start gap-3 p-4"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
                          {initials(user?.name ?? "?")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {user?.name ?? "Unknown user"}
                          </p>
                          {user?.username && (
                            <p className="truncate text-xs text-muted-foreground">
                              @{user.username}
                            </p>
                          )}
                          {request.message && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              “{request.message}”
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAccept(request._id)}
                          >
                            <CheckIcon className="size-4" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDecline(request._id)}
                          >
                            <XIcon className="size-4" />
                            Decline
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="members" className="mt-4">
              <div className="rounded-lg border bg-card">
                {members === undefined ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : members.members.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No members yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {members.members.map(({ membership, user }) => {
                      if (!user) return null
                      const isMe = membership.userId === members.myUserId
                      return (
                        <li
                          key={membership._id}
                          className="flex items-center gap-3 p-4"
                        >
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
                            {initials(user.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {user.name}
                              {isMe && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </p>
                            {user.username && (
                              <p className="truncate text-xs text-muted-foreground">
                                @{user.username}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={
                              membership.role === "admin"
                                ? "default"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {membership.role}
                          </Badge>
                          {!isMe && (
                            <MemberActions
                              name={user.name}
                              currentRole={
                                membership.role as CommunityRole
                              }
                              onChangeRole={(r) =>
                                handleUpdateRole(membership.userId, r)
                              }
                              onRemove={() =>
                                handleRemove(
                                  membership.userId,
                                  user.name,
                                )
                              }
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              <div className="rounded-lg border bg-card">
                {events === undefined ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : events.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <p>No events yet.</p>
                    <Button className="mt-3" size="sm" asChild>
                      <Link
                        href={`/dashboard/events/new?communityId=${community._id}`}
                      >
                        Create the first one
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {events.map(({ event }) => (
                      <li
                        key={event._id}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/events/${event._id}`}
                            className="block truncate text-sm font-medium hover:underline"
                          >
                            {event.name}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {new Date(event.startsAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {event.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="ads" className="mt-4">
              <div className="rounded-lg border border-dashed bg-card p-8 text-center">
                <MegaphoneIcon className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">
                  Ad placements coming soon
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PR #7 adds the ability to surface relevant business
                  ads inside this community.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />
          <p className="text-[10px] text-muted-foreground">
            You can&apos;t remove the last admin or demote yourself if
            you&apos;re the only one — promote someone else first.
          </p>
        </div>
      </div>
    </div>
  )
}

function MemberActions({
  name,
  currentRole,
  onChangeRole,
  onRemove,
}: {
  name: string
  currentRole: CommunityRole
  onChangeRole: (r: CommunityRole) => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {ASSIGNABLE_ROLES.filter((r) => r !== currentRole).map((r) => (
          <DropdownMenuItem key={r} onSelect={() => onChangeRole(r)}>
            Make {r}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} variant="destructive">
          <MinusCircleIcon className="size-3.5 mr-2" />
          Remove {name}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotAllowed() {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Admin only</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You need the admin role to manage this community.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/communities">Back to communities</Link>
        </Button>
      </div>
    </div>
  )
}
