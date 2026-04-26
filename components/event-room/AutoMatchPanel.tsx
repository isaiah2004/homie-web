"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { ShuffleIcon, SparklesIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  useIdentifiedAction,
  useIdentifiedMutation,
} from "@/hooks/use-identified"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

type Match = {
  userId: Id<"users">
  score: number
  reasons: string[]
}

export function AutoMatchPanel({
  eventId,
  viewerId: _viewerId,
}: {
  eventId: Id<"events">
  viewerId: Id<"users">
}) {
  const state = useQuery(api.eventRooms.getMatchState, { eventId })
  const computeInitial = useIdentifiedAction(
    api.eventMatch.computeInitialMatches,
  )
  const reroll = useIdentifiedAction(api.eventMatch.rerollMatches)
  const addFriend = useIdentifiedMutation(api.eventRooms.addFriendFromRoom)

  const computedRef = React.useRef(false)
  const [computing, setComputing] = React.useState(false)
  React.useEffect(() => {
    if (state === undefined) return
    if (state !== null) return
    if (computedRef.current) return
    computedRef.current = true
    setComputing(true)
    computeInitial({ eventId })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Could not compute matches",
        )
      })
      .finally(() => setComputing(false))
  }, [state, computeInitial, eventId])

  async function handleReroll() {
    setComputing(true)
    try {
      await reroll({ eventId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reroll failed")
    } finally {
      setComputing(false)
    }
  }

  async function handleAdd(targetUserId: Id<"users">) {
    try {
      await addFriend({ eventId, targetUserId })
      toast.success("Friend request sent")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {state === undefined || (state === null && computing) ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Computing matches…
            </p>
          ) : state === null ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No matches yet.
            </p>
          ) : state.matches.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Not enough people in the lobby yet — invite more friends!
            </p>
          ) : (
            state.matches.map((m: Match) => (
              <MatchCard
                key={m.userId}
                match={m}
                onAdd={() => handleAdd(m.userId)}
              />
            ))
          )}
        </div>
      </ScrollArea>
      {state && state.matches.length > 0 && (
        <div className="shrink-0 border-t p-3">
          <Button
            className="w-full"
            variant="outline"
            onClick={handleReroll}
            disabled={state.rerollsRemaining === 0 || computing}
          >
            <ShuffleIcon className="mr-2 size-4" />
            Reroll ({state.rerollsRemaining} left)
          </Button>
        </div>
      )}
    </div>
  )
}

function MatchCard({ match, onAdd }: { match: Match; onAdd: () => void }) {
  const user = useQuery(api.users.getUser, { userId: match.userId })
  if (user === undefined) {
    return (
      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!user) return null
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        <Link href={`/dashboard/profile/${user._id}`} className="shrink-0">
          <Avatar className="size-10">
            {user.avatar ? <AvatarImage src={user.avatar} /> : null}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              {user.location && (
                <p className="truncate text-xs text-muted-foreground">
                  {user.location}
                </p>
              )}
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 text-[10px]"
              title={`Match score ${match.score.toFixed(2)}`}
            >
              <SparklesIcon className="mr-1 size-3" />
              {Math.round(match.score * 100)}
            </Badge>
          </div>
          {match.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {match.reasons.map((r, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {r}
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onAdd}>
              Add friend
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
