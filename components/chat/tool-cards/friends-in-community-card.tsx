"use client"

import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type FriendsInCommunityOutput = {
  communityId: string
  friends: Array<{
    friendId: string
    role: "admin" | "moderator" | "announcer" | "member"
    friendName: string
    friendUsername: string | null
    friendAvatar: string | null
  }>
}

export function FriendsInCommunityCard({
  data,
  className,
}: {
  data: FriendsInCommunityOutput
  className?: string
}) {
  if (!data.friends || data.friends.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No overlapping friends"
        body="None of your friends are members of that community (yet)."
      />
    )
  }
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">
        {data.friends.length} of your friends are in this community
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.friends.map((f) => (
          <div
            key={f.friendId}
            className="flex items-center gap-3 rounded-lg border bg-card p-2.5"
          >
            <Avatar className="size-9 shrink-0">
              <AvatarImage src={f.friendAvatar ?? undefined} alt={f.friendName} />
              <AvatarFallback>{f.friendName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.friendName}</p>
              {f.friendUsername && (
                <p className="truncate text-[11px] text-muted-foreground">
                  @{f.friendUsername}
                </p>
              )}
            </div>
            {f.role !== "member" && (
              <Badge variant="secondary" className="text-[10px]">
                {f.role}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
