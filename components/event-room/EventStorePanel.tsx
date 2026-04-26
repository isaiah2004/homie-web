"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { SearchIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useIdentifiedMutation } from "@/hooks/use-identified"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

type Relationship =
  | "self"
  | "close"
  | "friend"
  | "pendingOutgoing"
  | "pendingIncoming"
  | "none"

export function EventStorePanel({
  eventId,
  viewerId,
}: {
  eventId: Id<"events">
  viewerId: Id<"users">
}) {
  const [search, setSearch] = React.useState("")

  const result = useQuery(api.eventRooms.listRoomMembers, {
    eventId,
    paginationOpts: { numItems: 100, cursor: null },
  })
  const addFriend = useIdentifiedMutation(api.eventRooms.addFriendFromRoom)
  const acceptFriend = useIdentifiedMutation(api.friends.acceptFriendRequest)
  const cancelFriend = useIdentifiedMutation(api.friends.cancelFriendRequest)

  const filtered = React.useMemo(() => {
    if (!result) return []
    const q = search.trim().toLowerCase()
    if (!q) return result.page
    return result.page.filter(({ user }) => {
      if (!user) return false
      return (
        user.name.toLowerCase().includes(q) ||
        (user.username ?? "").toLowerCase().includes(q)
      )
    })
  }, [result, search])

  async function handleAdd(targetUserId: Id<"users">) {
    try {
      await addFriend({ eventId, targetUserId })
      toast.success("Friend request sent")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request")
    }
  }
  async function handleAccept(targetUserId: Id<"users">) {
    try {
      await acceptFriend({ userId: viewerId, friendId: targetUserId })
      toast.success("Friend added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept")
    }
  }
  async function handleCancel(targetUserId: Id<"users">) {
    try {
      await cancelFriend({ userId: viewerId, friendId: targetUserId })
      toast.success("Request cancelled")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search lobby…"
            className="h-8 pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y">
          {result === undefined ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </li>
          ) : filtered.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {search ? "No match" : "Nobody else here yet"}
            </li>
          ) : (
            filtered.map(({ membership, user, relationship }) => {
              if (!user) return null
              const isHost = membership.role === "host"
              return (
                <li
                  key={membership._id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Link
                    href={`/dashboard/profile/${user._id}`}
                    className="shrink-0"
                  >
                    <Avatar className="size-9">
                      {user.avatar ? <AvatarImage src={user.avatar} /> : null}
                      <AvatarFallback>{initials(user.name)}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {user.name}
                      {isHost && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          · host
                        </span>
                      )}
                    </p>
                    {user.username && (
                      <p className="truncate text-xs text-muted-foreground">
                        @{user.username}
                      </p>
                    )}
                  </div>
                  <FriendActionButton
                    relationship={relationship as Relationship}
                    onAdd={() => handleAdd(user._id)}
                    onAccept={() => handleAccept(user._id)}
                    onCancel={() => handleCancel(user._id)}
                  />
                </li>
              )
            })
          )}
        </ul>
      </ScrollArea>
    </div>
  )
}

function FriendActionButton({
  relationship,
  onAdd,
  onAccept,
  onCancel,
}: {
  relationship: Relationship
  onAdd: () => void
  onAccept: () => void
  onCancel: () => void
}) {
  if (relationship === "self") return null
  if (relationship === "close" || relationship === "friend") {
    return (
      <span className="text-xs text-muted-foreground">Friends</span>
    )
  }
  if (relationship === "pendingOutgoing") {
    return (
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    )
  }
  if (relationship === "pendingIncoming") {
    return (
      <Button size="sm" variant="default" onClick={onAccept}>
        Accept
      </Button>
    )
  }
  return (
    <Button size="sm" variant="outline" onClick={onAdd}>
      Add friend
    </Button>
  )
}
