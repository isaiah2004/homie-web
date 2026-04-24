"use client"

import * as React from "react"

import type { Doc } from "@/convex/_generated/dataModel"
import { CommunityCard } from "@/components/community-card"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type CommunityListOutput = {
  communities: Array<{
    community: Doc<"communities">
    role: "admin" | "moderator" | "announcer" | "member"
  }>
  // `findCommunityByName` also returns its query echo in the output; we
  // don't render it but keep the shape open.
  query?: string
}

export function CommunityListCard({
  data,
  className,
  emptyTitle = "No communities",
  emptyBody,
}: {
  data: CommunityListOutput
  className?: string
  emptyTitle?: string
  emptyBody?: string
}) {
  if (!data.communities || data.communities.length === 0) {
    return (
      <EmptyState className={className} title={emptyTitle} body={emptyBody} />
    )
  }
  return (
    <div
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}
    >
      {data.communities.map(({ community, role }) => (
        <CommunityCard
          key={community._id}
          community={community}
          myRole={role}
        />
      ))}
    </div>
  )
}
