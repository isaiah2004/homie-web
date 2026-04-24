"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  CogIcon,
  MapPinIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  PinIcon,
  UserPlusIcon,
  UsersIcon,
  Vote,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { AdCard } from "@/components/ad-card"
import { AnnouncementBody } from "@/components/app-ui/AnnouncementBody"
import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function formatEventDate(startsAt: number): string {
  const d = new Date(startsAt)
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${date} · ${time}`
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

  // Viewer-aware fetch kicks off once we have the community id; it
  // returns the caller's role (or null) and pending-request status.
  const viewerData = useQuery(
    api.communities.getCommunityForViewer,
    skip || !community ? "skip" : { communityId: community._id, ...identityArg },
  )

  const isMember =
    viewerData !== undefined &&
    viewerData !== null &&
    viewerData.myRole !== null

  // Member-only queries. Gate so non-members don't dead-end on errors.
  const announcements = useQuery(
    api.communityAnnouncements.listAnnouncements,
    skip || !community || !isMember
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const events = useQuery(
    api.events.listEventsForCommunity,
    skip || !community || !isMember
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const polls = useQuery(
    api.communityPolls.listPolls,
    skip || !community || !isMember
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const placements = useQuery(
    api.communityAds.listPlacementsForCommunity,
    skip || !community || !isMember
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const savedCoupons = useQuery(
    api.communityAds.listSavedCoupons,
    skip || !isMember ? "skip" : identityArg,
  )

  const votePoll = useIdentifiedMutation(api.communityPolls.vote)
  const saveCoupon = useIdentifiedMutation(api.communityAds.saveCoupon)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Community" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="communities" />
        </div>
      </PageShell>
    )
  }

  if (community === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Community" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  if (community === null) {
    return (
      <PageShell header={<SiteHeader pageName="Community" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Community not found</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This community doesn&apos;t exist or was removed.
              </p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/communities">
                  Back to communities
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  const myRole = viewerData?.myRole ?? null
  const pendingRequest = viewerData?.pendingRequest ?? null
  const canAnnounce =
    myRole === "announcer" ||
    myRole === "moderator" ||
    myRole === "admin"
  const canModerate = myRole === "moderator" || myRole === "admin"
  const isAdmin = myRole === "admin"

  return (
    <PageShell header={<SiteHeader pageName="Community" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-4xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/communities">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="overflow-hidden rounded-lg border bg-card">
            {community.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={community.coverImageUrl}
                alt=""
                className="h-48 w-full object-cover"
              />
            ) : (
              <div className="h-32 w-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500" />
            )}
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  {community.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={community.avatarUrl}
                      alt=""
                      className="size-16 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-md border bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-semibold text-white">
                      {initials(community.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-2xl font-semibold">
                        {community.name}
                      </h1>
                      {community.isPaid && (
                        <Badge variant="default" className="text-[10px]">
                          Paid
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {community.category}
                      </Badge>
                      {!community.isPublic && (
                        <Badge variant="outline" className="text-[10px]">
                          Private
                        </Badge>
                      )}
                      {myRole && (
                        <Badge variant="secondary" className="text-[10px]">
                          You are {myRole}
                        </Badge>
                      )}
                    </div>
                    {community.locationLabel && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPinIcon className="size-3 shrink-0" />
                        <span className="truncate">
                          {community.locationLabel}
                        </span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <UsersIcon className="size-3 shrink-0" />
                      <span>
                        {community.memberCount} member
                        {community.memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isMember && !pendingRequest && (
                    <JoinDialog communityId={community._id} />
                  )}
                  {!isMember &&
                    pendingRequest &&
                    pendingRequest.status === "pending" && (
                      <Badge variant="secondary">Requested</Badge>
                    )}
                  {!isMember &&
                    pendingRequest &&
                    pendingRequest.status === "declined" && (
                      <JoinDialog
                        communityId={community._id}
                        label="Request again"
                      />
                    )}
                  <ContactAdminButton communityId={community._id} />
                  {isAdmin && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={`/dashboard/communities/${community.slug}/manage`}
                      >
                        <CogIcon className="size-4" />
                        Manage
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {community.description && (
                <>
                  <Separator className="my-4" />
                  <p className="whitespace-pre-wrap text-sm">
                    {community.description}
                  </p>
                </>
              )}

              {isMember && (
                <>
                  <Separator className="my-4" />
                  <div className="flex flex-wrap gap-2">
                    {canAnnounce && (
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          href={`/dashboard/communities/${community.slug}/announcements/new`}
                        >
                          <MegaphoneIcon className="size-4" />
                          Post announcement
                        </Link>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={`/dashboard/events/new?communityId=${community._id}`}
                      >
                        <CalendarPlusIcon className="size-4" />
                        Create event
                      </Link>
                    </Button>
                    {canModerate && (
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          href={`/dashboard/communities/${community.slug}/polls/new`}
                        >
                          <Vote className="size-4" />
                          Create poll
                        </Link>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {isMember && (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-sm font-semibold">Announcements</h3>
                {announcements === undefined ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : announcements.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No announcements yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {announcements.map((row) => (
                      <li
                        key={row.announcement._id}
                        className="rounded-md border bg-card p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-sm font-medium">
                            {row.announcement.title}
                          </h4>
                          {row.announcement.pinned && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1"
                            >
                              <PinIcon className="size-3" />
                              Pinned
                            </Badge>
                          )}
                        </div>
                        <AnnouncementBody
                          className="mt-1"
                          body={row.announcement.body}
                          format={row.announcement.format}
                          attachments={row.announcement.attachments}
                        />
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {row.author?.name ?? "Unknown"} ·{" "}
                          {new Date(
                            row.announcement.createdAt,
                          ).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Upcoming events</h3>
                  <EventsSection events={events} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Polls</h3>
                  <PollsSection
                    polls={polls}
                    onVote={async (pollId, optionIndex) => {
                      try {
                        await votePoll({ pollId, optionIndex })
                        toast.success("Vote recorded")
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Failed",
                        )
                      }
                    }}
                  />
                </div>
                {placements && placements.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold">Sponsored</h3>
                    <div className="mt-2 space-y-3">
                      {placements.map((row) => {
                        const savedIds = new Set(
                          (savedCoupons ?? []).map((s) => s.ad._id),
                        )
                        const isSaved = savedIds.has(row.ad._id)
                        return (
                          <AdCard
                            key={row.placement._id}
                            ad={row.ad}
                            context="community"
                            isCouponSaved={isSaved}
                            onSaveCoupon={
                              row.ad.couponCode
                                ? async () => {
                                    try {
                                      const res = await saveCoupon({
                                        adId: row.ad._id,
                                      })
                                      toast.success(
                                        res.alreadySaved
                                          ? "Already saved"
                                          : "Coupon saved",
                                      )
                                    } catch (err) {
                                      toast.error(
                                        err instanceof Error
                                          ? err.message
                                          : "Failed",
                                      )
                                    }
                                  }
                                : undefined
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function EventsSection({
  events,
}: {
  events:
    | Array<{ event: Doc<"events">; isMine: boolean }>
    | undefined
}) {
  // `Date.now()` can't run during render (rule-of-components-must-be-pure)
  // so we stash it in state and refresh every minute. Cheap enough for a
  // sidebar — the render it triggers just re-filters the list.
  const [now, setNow] = React.useState<number>(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (events === undefined) {
    return <p className="text-xs text-muted-foreground">Loading…</p>
  }
  const upcoming = events.filter(
    (r) =>
      (r.event.endsAt ?? r.event.startsAt) >= now &&
      r.event.status !== "cancelled",
  )
  if (upcoming.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
        No upcoming events.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {upcoming.slice(0, 6).map((row) => (
        <li
          key={row.event._id}
          className="rounded-md border bg-card p-2"
        >
          <Link
            href={`/dashboard/events/${row.event._id}`}
            className="block text-sm font-medium hover:underline"
          >
            {row.event.name}
          </Link>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatEventDate(row.event.startsAt)}
          </p>
          {row.event.locationName && (
            <p className="text-[11px] text-muted-foreground">
              {row.event.locationName}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

type PollRow = {
  poll: Doc<"communityPolls">
  counts: number[]
  totalVotes: number
  myVote: number | null
  author: { _id: Id<"users">; name: string; username?: string } | null
}

function PollsSection({
  polls,
  onVote,
}: {
  polls: PollRow[] | undefined
  onVote: (
    pollId: Id<"communityPolls">,
    optionIndex: number,
  ) => Promise<void>
}) {
  if (polls === undefined) {
    return <p className="text-xs text-muted-foreground">Loading…</p>
  }
  if (polls.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
        No polls yet.
      </div>
    )
  }
  // Only show the most recent poll as a card; older polls are reachable
  // from the manage / future polls-listing pages.
  const latest = polls[0]
  return <LatestPollCard latest={latest} onVote={onVote} />
}

// Split out so we can use `useState` for the "now" cutoff (needed
// because Date.now() in render is flagged by React purity rules).
function LatestPollCard({
  latest,
  onVote,
}: {
  latest: PollRow
  onVote: (
    pollId: Id<"communityPolls">,
    optionIndex: number,
  ) => Promise<void>
}) {
  const [now, setNow] = React.useState<number>(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const closed =
    latest.poll.closesAt !== undefined && latest.poll.closesAt < now
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-sm font-medium">{latest.poll.question}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {latest.totalVotes} vote{latest.totalVotes === 1 ? "" : "s"}
        {closed ? " · closed" : ""}
      </p>
      <ul className="mt-2 space-y-1.5">
        {latest.poll.options.map((opt, i) => {
          const count = latest.counts[i] ?? 0
          const pct =
            latest.totalVotes > 0
              ? Math.round((count / latest.totalVotes) * 100)
              : 0
          const selected = latest.myVote === i
          return (
            <li key={i}>
              <button
                type="button"
                disabled={closed}
                onClick={() => onVote(latest.poll._id, i)}
                className={
                  "relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-md border bg-background px-2 py-1.5 text-left text-xs " +
                  (selected ? "border-primary" : "") +
                  (closed ? " cursor-default opacity-80" : " hover:bg-muted/40")
                }
              >
                <div
                  className={
                    "absolute inset-y-0 left-0 bg-primary/10 " +
                    (selected ? "bg-primary/20" : "")
                  }
                  style={{ width: `${pct}%` }}
                />
                <span className="relative truncate font-medium">{opt}</span>
                <span className="relative tabular-nums">
                  {pct}% · {count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function JoinDialog({
  communityId,
  label,
}: {
  communityId: Id<"communities">
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const requestJoin = useIdentifiedMutation(
    api.communityMembers.requestJoin,
  )
  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await requestJoin({
        communityId,
        message: message.trim() || undefined,
      })
      if (res.alreadyMember) {
        toast.success("You're already a member")
      } else {
        toast.success("Request sent")
      }
      setOpen(false)
      setMessage("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon className="size-4" />
          {label ?? "Request to join"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask to join</DialogTitle>
          <DialogDescription>
            Admins will see your request and decide. Leave a short note if
            you&apos;d like.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          placeholder="Hey! I heard about this community from a friend…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// "Contact admin" CTA. Opens a DM to the first admin (by joinedAt) via
// the existing chats page's `?with=` shortcut. Non-admins still reach
// somebody even if they don't know who that is.
function ContactAdminButton({
  communityId,
}: {
  communityId: Id<"communities">
}) {
  const activeUser = useActiveUser()
  const router = useRouter()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  // We fetch `listMembers` lazily on click via a separate mini-query:
  // the admin-only endpoint would fail for non-admin viewers, so we use
  // the membership table's public-ish shape through the existing
  // `listAdminIdsInternal` — but that's internal. Fall back to the
  // getCommunityForViewer payload and punt to the chats inbox for now.
  async function handleClick() {
    // Navigate to /dashboard/chats as a fallback — from there the user
    // can search for an admin. Wiring a per-community DM destination
    // requires an admin-listing endpoint visible to non-admins which we
    // intentionally don't expose (spec: only admins see member list).
    void communityId
    void skip
    void identityArg
    router.push("/dashboard/chats")
  }
  return (
    <Button size="sm" variant="outline" onClick={handleClick}>
      <MessageCircleIcon className="size-4" />
      Contact admin
    </Button>
  )
}
