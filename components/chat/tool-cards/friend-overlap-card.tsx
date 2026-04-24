"use client"

import * as React from "react"
import { UsersIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type FriendOverlapRow = {
  friendId: string
  friendName: string
  friendUsername: string | null
  friendAvatar: string | null
  sharedItems: Array<{
    title: string
    type: string
    subtitle: string | null
    imageUrl: string | null
    externalSource: string | null
    externalId: string | null
  }>
}

export type FriendOverlapCardOutput = {
  domain: string
  provider: string | null
  friends: FriendOverlapRow[]
}

// Rendered when the model calls `findFriendsWithSharedMedia`.
// Shows one row per friend with their avatar, name, total overlap count, and
// a short preview list of shared items. Tapping a friend opens their DM
// thread (handled by the parent route — we just link to their profile).
export function FriendOverlapCard({
  data,
  className,
}: {
  data: FriendOverlapCardOutput
  className?: string
}) {
  if (!data.friends || data.friends.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No friend overlap yet"
        body={`None of your friends have ${data.domain} items in common with yours. Try adding more items to your profile, or invite more friends.`}
      />
    )
  }
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UsersIcon className="size-3" />
        <span>
          {data.friends.length} friend{data.friends.length === 1 ? "" : "s"}{" "}
          share your taste in {data.domain}
          {data.provider ? ` (${data.provider})` : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.friends.map((f) => (
          <FriendOverlapRowCard key={f.friendId} row={f} />
        ))}
      </div>
    </div>
  )
}

function FriendOverlapRowCard({ row }: { row: FriendOverlapRow }) {
  const previewItems = row.sharedItems.slice(0, 3)
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={row.friendAvatar ?? undefined} alt={row.friendName} />
          <AvatarFallback>{row.friendName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{row.friendName}</p>
            {row.friendUsername && (
              <span className="truncate text-xs text-muted-foreground">
                @{row.friendUsername}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {row.sharedItems.length} shared{" "}
            {row.sharedItems.length === 1 ? "item" : "items"}
          </p>
          {previewItems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {previewItems.map((item, i) => (
                <Badge
                  key={`${row.friendId}-${i}`}
                  variant="outline"
                  className="max-w-full truncate text-[10px]"
                  title={item.title}
                >
                  {item.title}
                </Badge>
              ))}
              {row.sharedItems.length > previewItems.length && (
                <Badge variant="outline" className="text-[10px]">
                  +{row.sharedItems.length - previewItems.length}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  body,
  className,
}: {
  title: string
  body?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed bg-card p-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      {body && <p className="mt-1">{body}</p>}
    </div>
  )
}
