"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ArrowLeftIcon, SendIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SearchIcon } from "lucide-react"

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
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const eventId = params.id as Id<"events">

  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)

  // Mirror the pattern used by /dashboard/chats and /dashboard/friends: in
  // dev mode the selected seeded user's id is the viewer; in prod we
  // upsert via Clerk's email → Convex row.
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

  const skipIdentified = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const data = useQuery(
    api.events.getEventForViewer,
    skipIdentified ? "skip" : { eventId, ...identityArg },
  )
  const friends = useQuery(
    api.friends.listFriends,
    viewerId ? { userId: viewerId } : "skip",
  )
  const existingInvites = useQuery(
    api.eventInvites.listInvitesForEvent,
    skipIdentified ? "skip" : { eventId, ...identityArg },
  )

  const invite = useIdentifiedMutation(api.eventInvites.inviteToEvent)

  const [selected, setSelected] = React.useState<Set<Id<"users">>>(
    () => new Set(),
  )
  const [search, setSearch] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  // Fast lookup of who is already invited so they appear pre-checked + disabled.
  const existingInviteeIds = React.useMemo(() => {
    if (!existingInvites) return new Set<Id<"users">>()
    return new Set(existingInvites.map((row) => row.invite.inviteeId))
  }, [existingInvites])

  const filteredFriends = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = friends ?? []
    if (!q) return all
    return all.filter(
      (f) =>
        f.friend &&
        (f.friend.name.toLowerCase().includes(q) ||
          (f.friend.username ?? "").toLowerCase().includes(q)),
    )
  }, [friends, search])

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Invite" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="events" />
        </div>
      </PageShell>
    )
  }

  if (data === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Invite" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  if (data === null || !data.isCreator) {
    return (
      <PageShell header={<SiteHeader pageName="Invite" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Not allowed</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Only the event creator can invite people.
              </p>
              <Button asChild className="mt-4">
                <Link href={`/dashboard/events/${eventId}`}>Back to event</Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  function toggle(id: Id<"users">) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      toast.error("Select at least one friend")
      return
    }
    setSubmitting(true)
    try {
      await invite({
        eventId,
        userIds: Array.from(selected),
      })
      toast.success(
        `Invited ${selected.size} ${selected.size === 1 ? "friend" : "friends"}`,
      )
      router.push(`/dashboard/events/${eventId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="Invite" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/events/${eventId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="rounded-lg border bg-card">
            <div className="p-4">
              <h2 className="text-base font-semibold">
                Invite friends to {data.event.name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick any friends you&apos;d like to invite. They&apos;ll get a
                notification immediately.
              </p>
              <div className="relative mt-3">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search friends…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Separator />
            <ScrollArea className="max-h-96">
              {friends === undefined ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Loading friends…
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {search
                    ? "No friends match your search"
                    : "You don't have any accepted friends yet."}
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredFriends.map(({ edge, friend }) => {
                    if (!friend) return null
                    const alreadyInvited = existingInviteeIds.has(friend._id)
                    const checked = alreadyInvited || selected.has(friend._id)
                    return (
                      <li key={edge._id}>
                        <label
                          className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
                          htmlFor={`inv-${friend._id}`}
                        >
                          <Checkbox
                            id={`inv-${friend._id}`}
                            checked={checked}
                            disabled={alreadyInvited}
                            onCheckedChange={() => toggle(friend._id)}
                          />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-xs font-semibold text-white">
                            {initials(friend.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {friend.name}
                            </p>
                            {friend.username && (
                              <p className="truncate text-xs text-muted-foreground">
                                @{friend.username}
                              </p>
                            )}
                          </div>
                          {alreadyInvited && (
                            <span className="text-xs text-muted-foreground">
                              Already invited
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </ScrollArea>
            <Separator />
            <div className="flex items-center justify-between gap-2 p-4">
              <p className="text-xs text-muted-foreground">
                {selected.size} selected
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting || selected.size === 0}
              >
                <SendIcon className="size-4" />
                {submitting ? "Sending…" : "Send invites"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
