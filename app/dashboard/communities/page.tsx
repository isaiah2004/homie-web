"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ChevronDownIcon,
  CompassIcon,
  MailIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CommunityCard } from "@/components/community-card"

type Category =
  | "all"
  | "fitness"
  | "spiritual"
  | "hobby"
  | "academic"
  | "food"
  | "social"
  | "other"

// Small preset list so a user without a location string still has
// something discoverable. Lat/lng are approximate city centroids.
const LOCATION_PRESETS: Array<{ label: string; lat: number; lng: number }> = [
  { label: "Bangalore", lat: 12.9716, lng: 77.5946 },
  { label: "Mumbai", lat: 19.076, lng: 72.8777 },
  { label: "Chennai", lat: 13.0827, lng: 80.2707 },
  { label: "Kochi", lat: 9.9312, lng: 76.2673 },
]

export default function Page() {
  // Next.js 16 prerenders this page; `useSearchParams()` (used below to
  // read `?tab=invites` from notification click-throughs) requires a
  // Suspense boundary to survive SSR bailout.
  return (
    <Suspense
      fallback={
        <PageShell header={<SiteHeader pageName="Communities" />}>
          <div className="flex-1 overflow-auto">
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          </div>
        </PageShell>
      }
    >
      <CommunitiesPage />
    </Suspense>
  )
}

function CommunitiesPage() {
  const activeUser = useActiveUser()
  const searchParams = useSearchParams()
  const initialTab =
    searchParams?.get("tab") === "discover"
      ? "discover"
      : searchParams?.get("tab") === "invites"
        ? "invites"
        : "mine"
  const [activeTab, setActiveTab] = React.useState<
    "mine" | "discover" | "invites"
  >(initialTab)

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const myCommunities = useQuery(
    api.communities.listMyCommunities,
    skip ? "skip" : identityArg,
  )
  const pendingInvites = useQuery(
    api.communityInvites.listMyPendingInvites,
    skip ? "skip" : identityArg,
  )

  // Simple text search — default Discover flow. Debounced so we don't
  // hit Convex on every keystroke.
  const [searchText, setSearchText] = React.useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>("")
  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 250)
    return () => clearTimeout(handle)
  }, [searchText])

  // Advanced (geo) controls. Hidden by default; kept intact so anyone who
  // wants precise near-me search can still get it.
  const [lat, setLat] = React.useState<string>("")
  const [lng, setLng] = React.useState<string>("")
  const [radius, setRadius] = React.useState<string>("25")
  const [category, setCategory] = React.useState<Category>("all")
  const [discoverReady, setDiscoverReady] = React.useState(false)
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  const textSearchResults = useQuery(
    api.communities.searchCommunitiesByText,
    skip || !debouncedSearch
      ? "skip"
      : {
          query: debouncedSearch,
          ...(category !== "all" ? { category } : {}),
          ...identityArg,
        },
  )

  const discoverArgs = React.useMemo(() => {
    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)
    const parsedRadius = parseFloat(radius)
    if (
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLng) ||
      !Number.isFinite(parsedRadius) ||
      parsedRadius <= 0
    ) {
      return null
    }
    return {
      lat: parsedLat,
      lng: parsedLng,
      radiusKm: parsedRadius,
      ...(category !== "all" ? { category } : {}),
    }
  }, [lat, lng, radius, category])

  const discoverResults = useQuery(
    api.communities.discoverCommunities,
    skip || !discoverArgs || !discoverReady
      ? "skip"
      : { ...discoverArgs, ...identityArg },
  )

  function applyPreset(preset: (typeof LOCATION_PRESETS)[number]) {
    setLat(preset.lat.toString())
    setLng(preset.lng.toString())
    setDiscoverReady(true)
  }

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Communities" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="communities" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell header={<SiteHeader pageName="Communities" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Communities</h2>
              <p className="text-sm text-muted-foreground">
                Join a neighbourhood group or start your own.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/communities/new">
                <PlusIcon className="size-4" />
                Create Community
              </Link>
            </Button>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) =>
              setActiveTab(v as "mine" | "discover" | "invites")
            }
            className="flex-1"
          >
            <TabsList>
              <TabsTrigger value="mine">
                <UsersRoundIcon className="size-4 mr-1" />
                My Communities
              </TabsTrigger>
              <TabsTrigger value="discover">
                <CompassIcon className="size-4 mr-1" />
                Discover
              </TabsTrigger>
              <TabsTrigger value="invites">
                <MailIcon className="size-4 mr-1" />
                Invites
                {pendingInvites && pendingInvites.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">
                    {pendingInvites.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="mine" className="mt-4">
              {myCommunities === undefined ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : myCommunities.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <UsersRoundIcon className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">
                    No communities yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Discover one near you or create a new one.
                  </p>
                  <Button className="mt-3" size="sm" asChild>
                    <Link href="/dashboard/communities/new">
                      <PlusIcon className="size-3.5" />
                      Create community
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {myCommunities.map(({ community, role }) => (
                    <CommunityCard
                      key={community._id}
                      community={community}
                      myRole={role}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="discover" className="mt-4 space-y-4">
              {/* Simple search — default. Matches on community name or city. */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search communities by name or city…"
                      className="pl-9"
                    />
                  </div>
                  <div className="w-full sm:w-44">
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as Category)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        <SelectItem value="fitness">Fitness</SelectItem>
                        <SelectItem value="spiritual">Spiritual</SelectItem>
                        <SelectItem value="hobby">Hobby</SelectItem>
                        <SelectItem value="academic">Academic</SelectItem>
                        <SelectItem value="food">Food</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Advanced — lat/lng/radius for precise near-me search. */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    <ChevronDownIcon
                      className={`size-3 transition-transform ${
                        advancedOpen ? "rotate-180" : ""
                      }`}
                    />
                    Advanced search (by coordinates)
                  </button>
                  {advancedOpen ? (
                    <div className="mt-3 rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Paste a lat/lng pair or pick a city preset. We&apos;ll
                        scan a rough 3×3 grid and filter to anything within
                        your radius.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Latitude
                          </label>
                          <Input
                            inputMode="decimal"
                            placeholder="12.9716"
                            value={lat}
                            onChange={(e) => setLat(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Longitude
                          </label>
                          <Input
                            inputMode="decimal"
                            placeholder="77.5946"
                            value={lng}
                            onChange={(e) => setLng(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Radius (km)
                          </label>
                          <Input
                            inputMode="decimal"
                            value={radius}
                            onChange={(e) => setRadius(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Or pick:
                        </span>
                        {LOCATION_PRESETS.map((p) => (
                          <Button
                            key={p.label}
                            size="sm"
                            variant="outline"
                            onClick={() => applyPreset(p)}
                          >
                            {p.label}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          className="ml-auto"
                          onClick={() => setDiscoverReady(true)}
                          disabled={!discoverArgs}
                        >
                          <SearchIcon className="size-3.5" />
                          Search nearby
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Results — text-search results take priority when active;
                  otherwise fall back to near-me results once the user has
                  run an advanced search. */}
              {debouncedSearch ? (
                textSearchResults === undefined ? (
                  <p className="text-sm text-muted-foreground">Searching…</p>
                ) : textSearchResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <p className="text-sm font-medium">
                      No communities match &ldquo;{debouncedSearch}&rdquo;.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try a broader term or use Advanced search for a
                      coordinate-based radius.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {textSearchResults.map(
                      ({ community, myRole, pendingRequest }) => (
                        <CommunityCard
                          key={community._id}
                          community={community}
                          myRole={myRole}
                          pendingRequest={pendingRequest}
                        />
                      ),
                    )}
                  </div>
                )
              ) : !discoverReady ? (
                <p className="text-sm text-muted-foreground">
                  Start typing a name or city, or open Advanced search for
                  near-me results.
                </p>
              ) : discoverResults === undefined ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : discoverResults.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">
                    No communities nearby
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a wider radius or be the first — create one.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {discoverResults.map(
                    ({ community, distanceKm, myRole, pendingRequest }) => (
                      <CommunityCard
                        key={community._id}
                        community={community}
                        distanceKm={distanceKm}
                        myRole={myRole}
                        pendingRequest={pendingRequest}
                      />
                    ),
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="invites" className="mt-4">
              <InvitesTabPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageShell>
  )
}

// Pending community invites for the current viewer. Shows each invite as a
// rich card with accept / decline buttons. The notification bell drops
// users here via `?tab=invites`.
function InvitesTabPanel() {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const pending = useQuery(
    api.communityInvites.listMyPendingInvites,
    skip ? "skip" : identityArg,
  )
  const accept = useIdentifiedMutation(api.communityInvites.acceptInvite)
  const decline = useIdentifiedMutation(api.communityInvites.declineInvite)
  const [busyId, setBusyId] =
    React.useState<Id<"communityInvites"> | null>(null)

  async function handleAccept(
    inviteId: Id<"communityInvites">,
    name: string,
  ) {
    setBusyId(inviteId)
    try {
      await accept({ inviteId })
      toast.success(`Joined ${name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(
    inviteId: Id<"communityInvites">,
    name: string,
  ) {
    setBusyId(inviteId)
    try {
      await decline({ inviteId })
      toast.success(`Declined invite to ${name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyId(null)
    }
  }

  if (pending === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (pending.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <MailIcon className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">No pending invites</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When a community admin invites you, it shows up here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pending.map(({ invite, community, invitedByName }) => {
        if (!community) return null
        const busy = busyId === invite._id
        return (
          <div
            key={invite._id}
            className="flex flex-col overflow-hidden rounded-lg border bg-card"
          >
            {community.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={community.coverImageUrl}
                alt=""
                className="h-20 w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-16 w-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500" />
            )}
            <div className="flex-1 p-4">
              <div className="flex items-start gap-3">
                {community.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={community.avatarUrl}
                    alt=""
                    className="size-10 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-md border bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
                    {community.name
                      .split(" ")
                      .map((n) => n[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/communities/${community.slug}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {community.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon className="size-3" />
                      {community.memberCount}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {community.category}
                    </Badge>
                  </div>
                </div>
              </div>
              {community.description && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {community.description}
                </p>
              )}
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPinIcon className="size-3" />
                Invited by {invitedByName ?? "an admin"}
              </p>
            </div>
            <div className="flex gap-2 border-t p-3">
              <Button
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => handleAccept(invite._id, community.name)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => handleDecline(invite._id, community.name)}
              >
                Decline
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
