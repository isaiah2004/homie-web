"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  MapPinIcon,
  MegaphoneIcon,
  MinusCircleIcon,
  MoreHorizontalIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { AdCard } from "@/components/ad-card"
import { EditCommunityDetailsForm } from "@/components/app-ui/EditCommunityDetailsForm"
import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  const invites = useQuery(
    api.communityInvites.listInvitesForCommunity,
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
      <PageShell header={<SiteHeader pageName="Manage community" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="communities" />
        </div>
      </PageShell>
    )
  }

  if (community === undefined || viewerData === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Manage community" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }
  if (community === null || viewerData === null) {
    return (
      <PageShell header={<SiteHeader pageName="Manage community" />}>
        <div className="flex-1 overflow-auto">
          <NotAllowed />
        </div>
      </PageShell>
    )
  }
  if (!isAdmin) {
    return (
      <PageShell header={<SiteHeader pageName="Manage community" />}>
        <div className="flex-1 overflow-auto">
          <NotAllowed />
        </div>
      </PageShell>
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
    <PageShell header={<SiteHeader pageName="Manage community" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
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

          <Tabs defaultValue="details" className="mt-4">
            <TabsList className="self-start">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="requests">
                Requests
                {requests && requests.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {requests.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="invites">
                Invites
                {invites && invites.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {invites.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="ads">Ads</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="rounded-lg border bg-card p-4 md:p-6">
                <EditCommunityDetailsForm community={community} />
              </div>
            </TabsContent>

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
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPinIcon className="size-3 shrink-0" />
                            {user?.location?.trim()
                              ? user.location
                              : "Location not specified"}
                          </p>
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

            <TabsContent value="invites" className="mt-4">
              <InvitesTab community={community} />
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
              <AdsTab community={community} isAdmin={isAdmin} />
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />
          <p className="text-[10px] text-muted-foreground">
            You can&apos;t remove the last admin or demote yourself if
            you&apos;re the only one — promote someone else first.
          </p>
        </div>
      </div>
    </PageShell>
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

// Ads tab on the community manage page. Paid communities get a picker
// (approved/running ads); free-tier communities see only the info card
// plus the current auto-placement (if any).
function AdsTab({
  community,
  isAdmin,
}: {
  community: Doc<"communities">
  isAdmin: boolean
}) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const placements = useQuery(
    api.communityAds.listPlacementsForCommunity,
    skip || !isAdmin
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  // Only paid communities get the full picker list; skip the query
  // otherwise so we don't surface admin-only data unnecessarily.
  const available = useQuery(
    api.communityAds.listAvailableAds,
    skip || !isAdmin || !community.isPaid
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const pickAd = useIdentifiedMutation(api.communityAds.pickAd)

  const [selectedAdId, setSelectedAdId] = React.useState<string>("")
  const [applying, setApplying] = React.useState(false)

  async function handleApply() {
    if (!selectedAdId) return
    setApplying(true)
    try {
      await pickAd({
        communityId: community._id,
        adId: selectedAdId as Id<"ads">,
      })
      toast.success("Ad placement updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setApplying(false)
    }
  }

  const currentPlacement = placements?.[0]

  return (
    <div className="space-y-4">
      {!community.isPaid && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <MegaphoneIcon className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Free tier</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Free-tier communities get an auto-rotated ad each week.
                Upgrade to pick your ads.
              </p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="mt-3"
              >
                <Link href="/dev/billing">Go to billing</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">This week&apos;s placement</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shown in the community sidebar. Rotates every Monday for free-tier
          communities.
        </p>
        {placements === undefined ? (
          <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
        ) : currentPlacement ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {currentPlacement.placement.placementType === "auto"
                  ? "Auto"
                  : "Admin pick"}
              </Badge>
            </div>
            <AdCard ad={currentPlacement.ad} context="business" />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No placement for this week yet. {community.isPaid
              ? "Pick one below."
              : "The weekly rotation will fill this in."}
          </p>
        )}
      </div>

      {community.isPaid && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Pick an ad</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose from approved and running ads.
          </p>
          {available === undefined ? (
            <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
          ) : available.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No approved ads yet.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select
                value={selectedAdId}
                onValueChange={(v) => setSelectedAdId(v)}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder="Select an ad" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((row) => (
                    <SelectItem key={row.ad._id} value={row.ad._id}>
                      {row.ad.title}
                      {row.business ? ` · ${row.business.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!selectedAdId || applying}
              >
                Apply
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Invites tab
// ─────────────────────────────────────────────────────────────────────────────

// Pending-invite list + Add / Bulk-add actions. Admin-only (enforced on the
// server too; this component is only rendered when `isAdmin === true`).
function InvitesTab({ community }: { community: Doc<"communities"> }) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const invites = useQuery(
    api.communityInvites.listInvitesForCommunity,
    skip ? "skip" : { communityId: community._id, ...identityArg },
  )
  const cancelInvite = useIdentifiedMutation(
    api.communityInvites.cancelInvite,
  )

  const [addOpen, setAddOpen] = React.useState(false)
  const [bulkOpen, setBulkOpen] = React.useState(false)

  async function handleCancel(inviteId: Id<"communityInvites">, name: string) {
    if (!confirm(`Revoke invite for ${name}?`)) return
    try {
      await cancelInvite({ inviteId })
      toast.success("Invite revoked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlusIcon className="size-4" />
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
          <UsersIcon className="size-4" />
          Bulk add
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {invites === undefined ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : invites.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No pending invites. Use{" "}
            <span className="font-medium">Add</span> or{" "}
            <span className="font-medium">Bulk add</span> to invite people.
          </p>
        ) : (
          <ul className="divide-y">
            {invites.map(({ invite, invitee, invitedByName }) => (
              <li
                key={invite._id}
                className="flex items-start gap-3 p-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
                  {initials(invitee?.name ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {invitee?.name ?? "Unknown user"}
                  </p>
                  {invitee?.username && (
                    <p className="truncate text-xs text-muted-foreground">
                      @{invitee.username}
                    </p>
                  )}
                  {invitee?.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {invitee.email}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Invited by {invitedByName ?? "someone"} ·{" "}
                    {new Date(invite.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleCancel(
                      invite._id,
                      invitee?.name ?? "this person",
                    )
                  }
                >
                  <XIcon className="size-4" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddInviteDialog
        community={community}
        open={addOpen}
        onOpenChange={setAddOpen}
        existingInviteeIds={
          new Set((invites ?? []).map((i) => i.invite.userId))
        }
      />
      <BulkAddInviteDialog
        community={community}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />
    </div>
  )
}

// Single-user invite dialog. Debounced search across name / username /
// email via `users.searchDiscoverable`. Clicking a result sends the invite
// immediately; the dialog stays open so the admin can queue more.
function AddInviteDialog({
  community,
  open,
  onOpenChange,
  existingInviteeIds,
}: {
  community: Doc<"communities">
  open: boolean
  onOpenChange: (v: boolean) => void
  existingInviteeIds: Set<Id<"users">>
}) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const [query, setQuery] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [pendingIds, setPendingIds] = React.useState<Set<Id<"users">>>(
    () => new Set(),
  )

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(handle)
  }, [query])

  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setDebounced("")
      setPendingIds(new Set())
    }
  }, [open])

  const members = useQuery(
    api.communityMembers.listMembers,
    skip || !open
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const memberIds = React.useMemo(
    () => new Set((members?.members ?? []).map((m) => m.membership.userId)),
    [members],
  )

  const excludeIds = React.useMemo(() => {
    const out: Id<"users">[] = []
    for (const id of memberIds) out.push(id)
    for (const id of existingInviteeIds) {
      if (!memberIds.has(id)) out.push(id)
    }
    return out
  }, [memberIds, existingInviteeIds])

  const results = useQuery(
    api.users.searchDiscoverable,
    skip || !open || debounced.length === 0
      ? "skip"
      : { query: debounced, excludeUserIds: excludeIds, limit: 15 },
  )

  const invite = useIdentifiedMutation(api.communityInvites.inviteUser)

  async function handleInvite(userId: Id<"users">, name: string) {
    setPendingIds((prev) => {
      const next = new Set(prev)
      next.add(userId)
      return next
    })
    try {
      const res = await invite({
        communityId: community._id,
        targetUserId: userId,
      })
      if ("alreadyMember" in res && res.alreadyMember) {
        toast.info(`${name} is already a member`)
      } else if ("alreadyInvited" in res && res.alreadyInvited) {
        toast.info(`${name} is already invited`)
      } else {
        toast.success(`Invited ${name}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite")
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone to {community.name}</DialogTitle>
          <DialogDescription>
            Search by name, username, or email. Click a result to send the
            invite.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-auto rounded-md border">
          {debounced.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Type at least one character to search.
            </p>
          ) : results === undefined ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No matches.
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((u) => {
                const pending = pendingIds.has(u._id)
                return (
                  <li
                    key={u._id}
                    className="flex items-center gap-3 p-3"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-xs font-semibold text-white">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {u.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.username ? `@${u.username}` : u.email}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => handleInvite(u._id, u.name)}
                    >
                      {pending ? "Invited" : "Invite"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Bulk-invite dialog. Flow:
//   step "input"   — pick emails vs usernames, paste the list, hit Resolve
//   step "confirm" — show classification (matches / members / invited /
//                    misses), click Confirm to actually send invites
//   step "done"    — show the final counts + any misses with a Copy button
function BulkAddInviteDialog({
  community,
  open,
  onOpenChange,
}: {
  community: Doc<"communities">
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  type Kind = "email" | "username"
  type Step = "input" | "confirm" | "done"

  const [kind, setKind] = React.useState<Kind>("email")
  const [text, setText] = React.useState("")
  const [step, setStep] = React.useState<Step>("input")
  const [resolved, setResolved] = React.useState<{
    matches: Array<{
      entry: string
      userId: Id<"users">
      name: string
      username: string | null
      email: string
    }>
    alreadyMembers: string[]
    alreadyInvited: string[]
    misses: string[]
  } | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [finalReport, setFinalReport] = React.useState<{
    invitedCount: number
    alreadyMembers: string[]
    alreadyInvited: string[]
    misses: string[]
  } | null>(null)

  // Reset state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setKind("email")
      setText("")
      setStep("input")
      setResolved(null)
      setSubmitting(false)
      setFinalReport(null)
    }
  }, [open])

  const entries = React.useMemo(
    () =>
      text
        .split(/[\s,]+/)
        .map((e) => e.trim().replace(/^@+/, ""))
        .filter(Boolean),
    [text],
  )
  const dedupedEntries = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of entries) {
      const lc = e.toLowerCase()
      if (seen.has(lc)) continue
      seen.add(lc)
      out.push(lc)
    }
    return out
  }, [entries])

  const resolvePreview = useQuery(
    api.communityInvites.resolveInviteList,
    skip || step !== "confirm" || dedupedEntries.length === 0
      ? "skip"
      : {
          communityId: community._id,
          kind,
          entries: dedupedEntries,
          ...identityArg,
        },
  )

  // When the confirm-step query finishes, snapshot it so we can send the
  // confirmed mutation with exactly the displayed numbers.
  React.useEffect(() => {
    if (step === "confirm" && resolvePreview) {
      setResolved(resolvePreview)
    }
  }, [step, resolvePreview])

  const inviteByEmail = useIdentifiedMutation(
    api.communityInvites.inviteManyByEmail,
  )
  const inviteByUsername = useIdentifiedMutation(
    api.communityInvites.inviteManyByUsername,
  )

  async function handleResolve() {
    if (dedupedEntries.length === 0) {
      toast.error("Paste at least one entry")
      return
    }
    if (dedupedEntries.length > 200) {
      toast.error("Max 200 entries per batch")
      return
    }
    setStep("confirm")
  }

  async function handleConfirm() {
    if (!resolved) return
    setSubmitting(true)
    try {
      const res =
        kind === "email"
          ? await inviteByEmail({
              communityId: community._id,
              emails: resolved.matches.map((m) => m.email),
            })
          : await inviteByUsername({
              communityId: community._id,
              usernames: resolved.matches
                .map((m) => m.username)
                .filter((u): u is string => typeof u === "string"),
            })
      setFinalReport({
        invitedCount: res.invited.length,
        alreadyMembers: res.alreadyMembers,
        alreadyInvited: res.alreadyInvited,
        misses: res.misses,
      })
      setStep("done")
      toast.success(
        `Invited ${res.invited.length} ${
          res.invited.length === 1 ? "person" : "people"
        }`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyMisses() {
    const misses = finalReport?.misses ?? resolved?.misses ?? []
    if (misses.length === 0) return
    try {
      await navigator.clipboard.writeText(misses.join("\n"))
      toast.success("Copied misses to clipboard")
    } catch {
      toast.error("Clipboard not available")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk invite to {community.name}</DialogTitle>
          <DialogDescription>
            Paste up to 200 entries. We&apos;ll resolve them before any
            invites go out.
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Identify people by:
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                value={kind}
                onValueChange={(v) => v && setKind(v as Kind)}
              >
                <ToggleGroupItem value="email">Emails</ToggleGroupItem>
                <ToggleGroupItem value="username">Usernames</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div>
              <label
                htmlFor="bulk-invite-textarea"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                {kind === "email"
                  ? "Emails (one per line; commas and spaces also work)"
                  : "Usernames (one per line; leading @ is fine)"}
              </label>
              <Textarea
                id="bulk-invite-textarea"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  kind === "email"
                    ? "alex@example.com\njamie@example.com\n…"
                    : "@alex\njamie\n…"
                }
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {dedupedEntries.length} unique{" "}
                {dedupedEntries.length === 1 ? "entry" : "entries"}
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleResolve}
                disabled={dedupedEntries.length === 0}
              >
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3">
            {resolvePreview === undefined ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Resolving…
              </p>
            ) : (
              <>
                <div className="rounded-md border p-3 text-sm">
                  <p>
                    Found{" "}
                    <span className="font-semibold">
                      {resolvePreview.matches.length}
                    </span>{" "}
                    {resolvePreview.matches.length === 1
                      ? "match"
                      : "matches"}
                    ,{" "}
                    <span className="font-semibold">
                      {resolvePreview.alreadyMembers.length}
                    </span>{" "}
                    already{" "}
                    {resolvePreview.alreadyMembers.length === 1
                      ? "member"
                      : "members"}
                    ,{" "}
                    <span className="font-semibold">
                      {resolvePreview.alreadyInvited.length}
                    </span>{" "}
                    already invited, and{" "}
                    <span className="font-semibold">
                      {resolvePreview.misses.length}
                    </span>{" "}
                    {resolvePreview.misses.length === 1
                      ? "miss"
                      : "misses"}
                    .
                  </p>
                </div>

                {resolvePreview.matches.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-md border">
                    <ul className="divide-y">
                      {resolvePreview.matches.map((m) => (
                        <li
                          key={m.userId}
                          className="flex items-center gap-2 px-3 py-2 text-sm"
                        >
                          <CheckIcon className="size-4 text-emerald-500" />
                          <span className="truncate">{m.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {m.username ? `@${m.username}` : m.email}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resolvePreview.misses.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-medium">
                      {resolvePreview.misses.length}{" "}
                      {resolvePreview.misses.length === 1
                        ? "entry"
                        : "entries"}{" "}
                      didn&apos;t match a user:
                    </p>
                    <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                      {resolvePreview.misses.join("\n")}
                    </p>
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep("input")}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  submitting ||
                  !resolvePreview ||
                  resolvePreview.matches.length === 0
                }
              >
                {submitting
                  ? "Sending…"
                  : `Invite ${resolvePreview?.matches.length ?? 0}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && finalReport && (
          <div className="space-y-3">
            <div className="rounded-md border bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
              Invited{" "}
              <span className="font-semibold">
                {finalReport.invitedCount}
              </span>{" "}
              {finalReport.invitedCount === 1 ? "person" : "people"}.
              {finalReport.alreadyMembers.length > 0 && (
                <>
                  {" "}
                  Skipped{" "}
                  {finalReport.alreadyMembers.length} already{" "}
                  {finalReport.alreadyMembers.length === 1
                    ? "member"
                    : "members"}
                  .
                </>
              )}
              {finalReport.alreadyInvited.length > 0 && (
                <>
                  {" "}
                  Skipped {finalReport.alreadyInvited.length} already
                  invited.
                </>
              )}
            </div>

            {finalReport.misses.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">
                    {finalReport.misses.length}{" "}
                    {finalReport.misses.length === 1 ? "miss" : "misses"}
                  </p>
                  <Button size="sm" variant="outline" onClick={copyMisses}>
                    <CopyIcon className="size-3.5" />
                    Copy
                  </Button>
                </div>
                <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                  {finalReport.misses.join("\n")}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
