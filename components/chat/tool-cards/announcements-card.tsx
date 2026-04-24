"use client"

import * as React from "react"
import Link from "next/link"
import { PinIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type RecentAnnouncementsOutput = {
  announcements: Array<{
    announcement: {
      _id: string
      title: string
      body: string
      pinned: boolean
      createdAt: number
    }
    community: {
      _id: string
      name: string
      slug: string
    }
    author: { name: string; username: string | null } | null
  }>
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.round(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ms).toLocaleDateString()
}

export function AnnouncementsCard({
  data,
  className,
}: {
  data: RecentAnnouncementsOutput
  className?: string
}) {
  if (!data.announcements || data.announcements.length === 0) {
    return (
      <EmptyState
        className={className}
        title="No recent announcements"
        body="Your communities are quiet right now."
      />
    )
  }
  return (
    <div className={cn("space-y-2", className)}>
      {data.announcements.map(({ announcement, community, author }) => {
        const snippet = announcement.body
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180)
        return (
          <Link
            key={announcement._id}
            href={`/dashboard/communities/${community.slug}`}
            className="block rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {community.name}
              </Badge>
              {announcement.pinned && (
                <PinIcon className="size-3 text-amber-500" />
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {relativeTime(announcement.createdAt)}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium">
              {announcement.title}
            </p>
            {snippet && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {snippet}
                {announcement.body.length > snippet.length ? "…" : ""}
              </p>
            )}
            {author && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                by {author.name}
              </p>
            )}
          </Link>
        )
      })}
    </div>
  )
}
