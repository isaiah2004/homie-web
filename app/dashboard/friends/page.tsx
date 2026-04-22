"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"
import {
  CollapseButton,
  ColumnHeader,
  PageShell,
  ResizeHandle,
  useResizableWidth,
} from "@/components/dashboard-layout"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  MapPinIcon,
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FriendEdge = { edge: Doc<"friends">; friend: Doc<"users"> | null }

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function matchesSearch(user: Doc<"users"> | null, q: string) {
  if (!q.trim()) return true
  if (!user) return false
  const needle = q.toLowerCase()
  return (
    user.name.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle) ||
    (user.location ?? "").toLowerCase().includes(needle)
  )
}

function CloseBadge() {
  return (
    <Badge
      variant="outline"
      className="bg-pink-100 text-pink-800 border-pink-200"
    >
      <span className="flex items-center gap-1">
        <HeartIcon className="size-3" />
        Close
      </span>
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile pane (right column on every tab)
// ─────────────────────────────────────────────────────────────────────────────

function UserProfilePane({
  viewerId,
  selected,
}: {
  viewerId: Id<"users"> | undefined
  selected: { user: Doc<"users"> | null; tier?: "close" | "friend" } | null
}) {
  // Always fetch the viewer-filtered version of the target profile so that
  // visibility-tagged fields (interests, media, places, projects, workplace,
  // school) are gated server-side. Never render from `selected.user` directly.
  const filtered = useQuery(
    api.users.getUserForViewer,
    viewerId && selected?.user
      ? { viewerId, targetUserId: selected.user._id }
      : "skip",
  )
  const mutualCount = useQuery(
    api.friends.countMutualFriends,
    viewerId && selected?.user
      ? { userAId: viewerId, userBId: selected.user._id }
      : "skip",
  )

  if (!selected || !selected.user) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">
        <p className="text-sm">
          Hover or select a user to view their profile
        </p>
      </div>
    )
  }

  // While the filtered query is in flight, fall back to the minimal identity
  // bits we already have (name/avatar) so the pane doesn't flash blank.
  const shownName = filtered?.name ?? selected.user.name
  const shownLocation = filtered?.location
  const shownBio = filtered?.bio
  const shownInterests = filtered?.interests ?? []
  const { tier } = selected

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-2xl font-semibold text-white">
            {initials(shownName)}
          </div>
          <h3 className="text-xl font-semibold">{shownName}</h3>
          {shownLocation && (
            <div className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <MapPinIcon className="size-3" />
              {shownLocation}
            </div>
          )}
        </div>

        <Separator />

        {shownBio && (
          <div>
            <h4 className="mb-2 text-sm font-medium">About</h4>
            <p className="text-sm text-muted-foreground">{shownBio}</p>
          </div>
        )}

        {shownInterests.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Interests</h4>
            <div className="flex flex-wrap gap-2">
              {shownInterests.map((interest, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {interest.value}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="size-4 text-muted-foreground" />
            <span className="text-sm">Mutual friends</span>
          </div>
          <Badge variant="secondary">
            {mutualCount === undefined ? "…" : mutualCount}
          </Badge>
        </div>

        {tier === "close" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartIcon className="size-4 text-muted-foreground" />
              <span className="text-sm">Tier</span>
            </div>
            <CloseBadge />
          </div>
        )}

        <div className="space-y-2 pt-4">
          {tier ? (
            <Button asChild className="w-full" size="sm">
              <Link href={`/dashboard/chats?with=${selected.user._id}`}>
                <MessageCircleIcon className="mr-2 size-4" />
                Send Message
              </Link>
            </Button>
          ) : (
            <Button
              className="w-full"
              size="sm"
              disabled
              title="Become friends first"
            >
              <MessageCircleIcon className="mr-2 size-4" />
              Send Message
            </Button>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Page() {
  const activeUser = useActiveUser()
  const clerkLoaded = activeUser.isLoaded
  const email = activeUser.email ?? undefined
  const username = activeUser.username ?? undefined
  const name = activeUser.fullName ?? undefined

  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)

  // Dev mode: the selected seeded user's id IS the viewer id. Production
  // goes through getOrCreateUser to map Clerk email → Convex users row.
  React.useEffect(() => {
    if (activeUser.isDevMode) {
      setViewerId(activeUser.devUserId)
      return
    }
    if (!email) return
    getOrCreateUser({ email, username, name })
      .then((id) => setViewerId(id as Id<"users">))
      .catch((err) => {
        console.error(err)
        toast.error("Failed to sync your account")
      })
  }, [
    activeUser.isDevMode,
    activeUser.devUserId,
    email,
    username,
    name,
    getOrCreateUser,
  ])

  const me = useQuery(
    api.users.getUser,
    viewerId ? { userId: viewerId } : "skip",
  )

  const friends = useQuery(
    api.friends.listFriends,
    viewerId ? { userId: viewerId } : "skip",
  )
  const incoming = useQuery(
    api.friends.listIncomingRequests,
    viewerId ? { userId: viewerId } : "skip",
  )
  const outgoing = useQuery(
    api.friends.listOutgoingRequests,
    viewerId ? { userId: viewerId } : "skip",
  )

  const sendRequest = useMutation(api.friends.sendFriendRequest)
  const acceptRequest = useMutation(api.friends.acceptFriendRequest)
  const declineRequest = useMutation(api.friends.declineFriendRequest)
  const cancelRequest = useMutation(api.friends.cancelFriendRequest)
  const removeFriend = useMutation(api.friends.removeFriend)
  const setCloseFriend = useMutation(api.friends.setCloseFriend)

  const [activeTab, setActiveTab] = React.useState("close-friends")
  const [selected, setSelected] = React.useState<
    { user: Doc<"users"> | null; tier?: "close" | "friend" } | null
  >(null)

  const [closeSearch, setCloseSearch] = React.useState("")
  const [friendsSearch, setFriendsSearch] = React.useState("")
  const [addSearch, setAddSearch] = React.useState("")

  // Right-side profile pane is collapsible + resizable, matching the Homie
  // drawer on /chats. On the Friends tab we also make the Close Friends
  // column independently resizable — All Friends in the middle keeps
  // `flex-1` and absorbs the remaining width.
  const closeFriendsColumn = useResizableWidth({
    initial: 380,
    min: 260,
    max: 560,
    side: "right",
  })
  const profilePane = useResizableWidth({
    initial: 340,
    min: 280,
    max: 520,
    side: "left",
  })
  const [profileOpen, setProfileOpen] = React.useState(true)

  const closeFriends = React.useMemo<FriendEdge[]>(
    () => (friends ?? []).filter((f) => f.edge.tier === "close"),
    [friends],
  )
  const regularFriends = React.useMemo<FriendEdge[]>(
    () => (friends ?? []).filter((f) => f.edge.tier === "friend"),
    [friends],
  )

  const filteredClose = closeFriends.filter((f) =>
    matchesSearch(f.friend, closeSearch),
  )
  const filteredRegular = regularFriends.filter((f) =>
    matchesSearch(f.friend, friendsSearch),
  )

  // Username prefix search. Strips a leading `@` so both `@isa` and `isa`
  // work; the backend normalizes to lowercase.
  const searchPrefix = addSearch.trim().replace(/^@/, "")
  const searchResults = useQuery(
    api.users.searchUsersByUsername,
    viewerId && searchPrefix.length >= 1
      ? { prefix: searchPrefix, excludeUserId: viewerId, limit: 20 }
      : "skip",
  )

  // Build fast lookup sets so each result card can show the right CTA without
  // a per-row query (accepted friend, pending outgoing, pending incoming).
  const friendIds = React.useMemo(
    () => new Set((friends ?? []).map((f) => f.edge.friendId)),
    [friends],
  )
  const incomingIds = React.useMemo(
    () => new Set((incoming ?? []).map((f) => f.edge.friendId)),
    [incoming],
  )
  const outgoingIds = React.useMemo(
    () => new Set((outgoing ?? []).map((f) => f.edge.friendId)),
    [outgoing],
  )

  async function handleSendRequest(toUserId: Id<"users">) {
    if (!viewerId) return
    try {
      const result = await sendRequest({
        fromUserId: viewerId,
        toUserId,
      })
      toast.success(
        result.status === "accepted"
          ? "You're now friends"
          : "Friend request sent",
      )
      setAddSearch("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send request")
    }
  }

  async function handleAccept(friendId: Id<"users">) {
    if (!viewerId) return
    try {
      await acceptRequest({ userId: viewerId, friendId })
      toast.success("Friend request accepted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept")
    }
  }

  async function handleDecline(friendId: Id<"users">) {
    if (!viewerId) return
    try {
      await declineRequest({ userId: viewerId, friendId })
      toast.success("Request declined")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline")
    }
  }

  async function handleCancel(friendId: Id<"users">) {
    if (!viewerId) return
    try {
      await cancelRequest({ userId: viewerId, friendId })
      toast.success("Request cancelled")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel")
    }
  }

  async function handleToggleClose(friendId: Id<"users">, makeClose: boolean) {
    if (!viewerId) return
    try {
      await setCloseFriend({
        userId: viewerId,
        friendId,
        isClose: makeClose,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tier")
    }
  }

  async function handleRemove(friendId: Id<"users">) {
    if (!viewerId) return
    try {
      await removeFriend({ userId: viewerId, friendId })
      toast.success("Friend removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove")
    }
  }

  const headerNode = (
    <SiteHeader
      pageName="Friends"
      centerSlot={
        <TabsList className="h-9">
          <TabsTrigger value="close-friends">Friends</TabsTrigger>
          <TabsTrigger value="friend-requests">
            Requests
            {incoming && incoming.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {incoming.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="add-friends">Add Friends</TabsTrigger>
        </TabsList>
      }
      rightSlot={
        <CollapseButton
          side="right"
          open={profileOpen}
          onToggle={() => setProfileOpen((v) => !v)}
          label={profileOpen ? "Hide profile pane" : "Show profile pane"}
        />
      }
    />
  )

  // Loading shell while Clerk + Convex resolve the viewer.
  if (!clerkLoaded) {
    return (
      <PageShell header={<SiteHeader pageName="Friends" />}>
        <div className="flex-1 p-6 text-sm text-muted-foreground">
          Loading…
        </div>
      </PageShell>
    )
  }
  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Friends" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="friends" />
        </div>
      </PageShell>
    )
  }
  if (!viewerId || me === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Friends" />}>
        <div className="flex-1 p-6 text-sm text-muted-foreground">
          Loading…
        </div>
      </PageShell>
    )
  }

  // The right-hand profile pane (shared across all three tabs). Rendered once
  // to the right of the TabsContent so collapsing it affects every tab.
  const profileDrawer =
    profileOpen ? (
      <>
        <ResizeHandle
          onMouseDown={profilePane.onMouseDown}
          label="Resize profile pane"
        />
        <div
          className="flex min-h-0 shrink-0 flex-col bg-background"
          style={{ width: `${profilePane.width}px` }}
        >
          <ColumnHeader
            title="Profile"
            actions={
              <CollapseButton
                side="right"
                open={profileOpen}
                onToggle={() => setProfileOpen(false)}
                label="Hide profile pane"
              />
            }
          />
          <div className="min-h-0 flex-1">
            <UserProfilePane viewerId={viewerId} selected={selected} />
          </div>
        </div>
      </>
    ) : null

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      // `gap-0` overrides Tabs' default `gap-2` so the SiteHeader's border-b
      // sits flush against the column content below (matches /dashboard/homie).
      className="flex h-[calc(100vh-1rem)] flex-col gap-0"
    >
      {headerNode}

      {/* ─── Close Friends + All Friends ─── */}
      <TabsContent
        value="close-friends"
        className="m-0 flex min-h-0 flex-1 overflow-hidden"
      >
        <FriendsSplitColumn
          leftWidth={closeFriendsColumn.width}
          onLeftResize={closeFriendsColumn.onMouseDown}
          leftTitle={
            <span className="flex items-center gap-2">
              <HeartIcon className="size-4 text-pink-500" />
              Close Friends
            </span>
          }
          leftSearch={closeSearch}
          onLeftSearchChange={setCloseSearch}
          leftPlaceholder="Search close friends…"
          leftEmpty={
            closeSearch ? "No matches" : "No close friends yet"
          }
          leftLoading={friends === undefined}
          leftRows={filteredClose.map(({ edge, friend }) =>
            friend ? (
              <FriendRow
                key={edge._id}
                user={friend}
                tier="close"
                onSelect={() =>
                  setSelected({ user: friend, tier: "close" })
                }
                actionIcon={<ChevronRightIcon className="size-4" />}
                onAction={() => handleToggleClose(friend._id, false)}
                actionLabel="Demote to friend"
                onRemove={() => handleRemove(friend._id)}
              />
            ) : null,
          )}
          rightTitle="All Friends"
          rightSearch={friendsSearch}
          onRightSearchChange={setFriendsSearch}
          rightPlaceholder="Search friends…"
          rightEmpty={friendsSearch ? "No matches" : "No other friends"}
          rightLoading={friends === undefined}
          rightRows={filteredRegular.map(({ edge, friend }) =>
            friend ? (
              <FriendRow
                key={edge._id}
                user={friend}
                tier="friend"
                onSelect={() =>
                  setSelected({ user: friend, tier: "friend" })
                }
                actionIcon={<ChevronLeftIcon className="size-4" />}
                onAction={() => handleToggleClose(friend._id, true)}
                actionLabel="Promote to close friend"
                onRemove={() => handleRemove(friend._id)}
              />
            ) : null,
          )}
        />
        {profileDrawer}
      </TabsContent>

      {/* ─── Requests ─── */}
      <TabsContent
        value="friend-requests"
        className="m-0 flex min-h-0 flex-1 overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <ColumnHeader
            title="Friend Requests"
            actions={
              <p className="text-xs text-muted-foreground">
                {incoming?.length ?? 0} incoming ·{" "}
                {outgoing?.length ?? 0} outgoing
              </p>
            }
          />
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-6 p-4">
              <section>
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                  Incoming
                </h4>
                {incoming === undefined ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : incoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No incoming requests
                  </p>
                ) : (
                  <div className="space-y-3">
                    {incoming.map(({ edge, friend }) =>
                      friend ? (
                        <RequestCard
                          key={edge._id}
                          user={friend}
                          onSelect={() => setSelected({ user: friend })}
                          primary={{
                            label: "Accept",
                            icon: <CheckIcon className="mr-1 size-3" />,
                            onClick: () => handleAccept(friend._id),
                          }}
                          secondary={{
                            label: "Decline",
                            icon: <XIcon className="mr-1 size-3" />,
                            onClick: () => handleDecline(friend._id),
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                  Outgoing
                </h4>
                {outgoing === undefined ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : outgoing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No outgoing requests
                  </p>
                ) : (
                  <div className="space-y-3">
                    {outgoing.map(({ edge, friend }) =>
                      friend ? (
                        <RequestCard
                          key={edge._id}
                          user={friend}
                          onSelect={() => setSelected({ user: friend })}
                          secondary={{
                            label: "Cancel",
                            icon: <XIcon className="mr-1 size-3" />,
                            onClick: () => handleCancel(friend._id),
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        </div>
        {profileDrawer}
      </TabsContent>

      {/* ─── Add Friends ─── */}
      <TabsContent
        value="add-friends"
        className="m-0 flex min-h-0 flex-1 overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <ColumnHeader title="Find Friends" />
          <div className="shrink-0 border-b p-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by @username…"
                className="pl-9"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Prefix match — typing `isa` matches `isaiah_m`. Usernames are
              your Clerk handle.
            </p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {!searchPrefix ? (
                <div className="py-8 text-center text-muted-foreground">
                  <SearchIcon className="mx-auto mb-2 size-8 opacity-50" />
                  <p>Start typing a username</p>
                </div>
              ) : searchResults === undefined ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Searching…
                </p>
              ) : searchResults.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">
                    No users matching “{searchPrefix}”
                  </p>
                </div>
              ) : (
                searchResults.map((result) => {
                  const state = friendIds.has(result._id)
                    ? "friend"
                    : outgoingIds.has(result._id)
                      ? "outgoing"
                      : incomingIds.has(result._id)
                        ? "incoming"
                        : "none"
                  return (
                    <SearchResultCard
                      key={result._id}
                      user={result}
                      state={state}
                      onSelect={() => setSelected({ user: result })}
                      onSend={() => handleSendRequest(result._id)}
                      onAccept={() => handleAccept(result._id)}
                      onCancel={() => handleCancel(result._id)}
                    />
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>
        {profileDrawer}
      </TabsContent>
    </Tabs>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Friends-tab left split (close friends | all friends)
// ─────────────────────────────────────────────────────────────────────────────

function FriendsSplitColumn({
  leftWidth,
  onLeftResize,
  leftTitle,
  leftSearch,
  onLeftSearchChange,
  leftPlaceholder,
  leftEmpty,
  leftLoading,
  leftRows,
  rightTitle,
  rightSearch,
  onRightSearchChange,
  rightPlaceholder,
  rightEmpty,
  rightLoading,
  rightRows,
}: {
  leftWidth: number
  onLeftResize: (event: React.MouseEvent) => void
  leftTitle: React.ReactNode
  leftSearch: string
  onLeftSearchChange: (v: string) => void
  leftPlaceholder: string
  leftEmpty: string
  leftLoading: boolean
  leftRows: React.ReactNode
  rightTitle: React.ReactNode
  rightSearch: string
  onRightSearchChange: (v: string) => void
  rightPlaceholder: string
  rightEmpty: string
  rightLoading: boolean
  rightRows: React.ReactNode
}) {
  return (
    <>
      <SplitHalf
        title={leftTitle}
        search={leftSearch}
        onSearchChange={onLeftSearchChange}
        placeholder={leftPlaceholder}
        empty={leftEmpty}
        loading={leftLoading}
        rows={leftRows}
        width={leftWidth}
      />
      <ResizeHandle
        onMouseDown={onLeftResize}
        label="Resize close friends column"
      />
      <SplitHalf
        title={rightTitle}
        search={rightSearch}
        onSearchChange={onRightSearchChange}
        placeholder={rightPlaceholder}
        empty={rightEmpty}
        loading={rightLoading}
        rows={rightRows}
      />
    </>
  )
}

// A column in the Friends split view. Pass `width` to make it a fixed-width
// (resizable) column, omit it for the flex-1 "absorb the rest" column.
function SplitHalf({
  title,
  search,
  onSearchChange,
  placeholder,
  empty,
  loading,
  rows,
  width,
}: {
  title: React.ReactNode
  search: string
  onSearchChange: (v: string) => void
  placeholder: string
  empty: string
  loading: boolean
  rows: React.ReactNode
  width?: number
}) {
  const rowArray = React.Children.toArray(rows).filter(Boolean)
  const isFixed = width != null
  return (
    <div
      className={`flex min-h-0 flex-col bg-background ${isFixed ? "shrink-0" : "flex-1"}`}
      style={isFixed ? { width: `${width}px` } : undefined}
    >
      <ColumnHeader title={title} />
      <div className="shrink-0 border-b p-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            className="pl-9"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : rowArray.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {empty}
            </p>
          ) : (
            rowArray
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row components
// ─────────────────────────────────────────────────────────────────────────────

function FriendRow({
  user,
  tier,
  onSelect,
  actionIcon,
  actionLabel,
  onAction,
  onRemove,
}: {
  user: Doc<"users">
  tier: "close" | "friend"
  onSelect: () => void
  actionIcon: React.ReactNode
  actionLabel: string
  onAction: () => void
  onRemove: () => void
}) {
  const gradient =
    tier === "close"
      ? "from-pink-400 to-red-600"
      : "from-blue-400 to-purple-600"
  return (
    <div
      className="cursor-pointer rounded-lg p-3 transition-colors hover:bg-muted/50"
      onMouseEnter={onSelect}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-sm font-semibold text-white`}
        >
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            {tier === "close" && <CloseBadge />}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {user.location && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3" />
                {user.location}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          title={actionLabel}
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
        >
          {actionIcon}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Remove friend"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function RequestCard({
  user,
  onSelect,
  primary,
  secondary,
}: {
  user: Doc<"users">
  onSelect: () => void
  primary?: {
    label: string
    icon: React.ReactNode
    onClick: () => void
  }
  secondary: {
    label: string
    icon: React.ReactNode
    onClick: () => void
  }
}) {
  return (
    <div
      className="cursor-pointer space-y-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
      onMouseEnter={onSelect}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-blue-600 font-semibold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {primary && (
          <Button
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation()
              primary.onClick()
            }}
          >
            {primary.icon}
            {primary.label}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={primary ? "flex-1" : "w-full"}
          onClick={(e) => {
            e.stopPropagation()
            secondary.onClick()
          }}
        >
          {secondary.icon}
          {secondary.label}
        </Button>
      </div>
    </div>
  )
}

function SearchResultCard({
  user,
  state,
  onSelect,
  onSend,
  onAccept,
  onCancel,
}: {
  user: Doc<"users">
  state: "friend" | "outgoing" | "incoming" | "none"
  onSelect: () => void
  onSend: () => void
  onAccept: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="cursor-pointer space-y-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
      onMouseEnter={onSelect}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 font-semibold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.username ? `@${user.username}` : user.email}
          </p>
        </div>
      </div>
      {state === "friend" ? (
        <Button size="sm" className="w-full" variant="outline" disabled>
          Already friends
        </Button>
      ) : state === "outgoing" ? (
        <Button
          size="sm"
          className="w-full"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
        >
          <XIcon className="mr-1 size-3" />
          Cancel request
        </Button>
      ) : state === "incoming" ? (
        <Button
          size="sm"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation()
            onAccept()
          }}
        >
          <CheckIcon className="mr-1 size-3" />
          Accept their request
        </Button>
      ) : (
        <Button
          size="sm"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation()
            onSend()
          }}
        >
          <PlusIcon className="mr-1 size-3" />
          Send friend request
        </Button>
      )}
    </div>
  )
}
