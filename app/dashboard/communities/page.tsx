"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import {
  CompassIcon,
  PlusIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
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
  const activeUser = useActiveUser()

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

  // Discover controls. We keep them client-side state so the user can
  // iterate on radius + category without re-fetching on every keystroke.
  const [lat, setLat] = React.useState<string>("")
  const [lng, setLng] = React.useState<string>("")
  const [radius, setRadius] = React.useState<string>("25")
  const [category, setCategory] = React.useState<Category>("all")
  const [discoverReady, setDiscoverReady] = React.useState(false)

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
      <div>
        <SiteHeader pageName="Communities" />
        <PickDevUserEmptyState pageName="communities" />
      </div>
    )
  }

  return (
    <div>
      <SiteHeader pageName="Communities" />
      <div className="flex flex-1 flex-col">
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

          <Tabs defaultValue="mine" className="flex-1">
            <TabsList>
              <TabsTrigger value="mine">
                <UsersRoundIcon className="size-4 mr-1" />
                My Communities
              </TabsTrigger>
              <TabsTrigger value="discover">
                <CompassIcon className="size-4 mr-1" />
                Discover
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
              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm font-medium">
                  Enter coordinates to discover communities near you.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste a lat/lng pair or pick a city preset. We&apos;ll
                  scan a rough 3x3 grid and filter to anything within your
                  radius.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
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
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Category
                    </label>
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as Category)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
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
                    Search
                  </Button>
                </div>
              </div>

              {!discoverReady ? (
                <p className="text-sm text-muted-foreground">
                  Waiting for coordinates…
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
          </Tabs>
        </div>
      </div>
    </div>
  )
}
