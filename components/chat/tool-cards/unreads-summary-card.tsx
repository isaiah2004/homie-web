"use client"

import * as React from "react"
import Link from "next/link"
import { MessageCircleIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { EmptyState } from "./friend-overlap-card"

export type UnreadsSummaryOutput = {
  threads: Array<{
    conversationId: string
    other: {
      _id: string
      name: string
      username: string | null
      avatar: string | null
    }
    unreadCount: number
    previews: Array<{
      from: "them" | "me"
      content: string
      sentAt: number
    }>
    lastMessageAt: number
  }>
}

export function UnreadsSummaryCard({
  data,
  className,
}: {
  data: UnreadsSummaryOutput
  className?: string
}) {
  if (!data.threads || data.threads.length === 0) {
    return (
      <EmptyState
        className={className}
        title="Inbox zero"
        body="You're all caught up — no unread DMs."
      />
    )
  }
  const totalUnread = data.threads.reduce((sum, t) => sum + t.unreadCount, 0)
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageCircleIcon className="size-3" />
        <span>
          {totalUnread} unread across {data.threads.length} thread
          {data.threads.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-1.5">
        {data.threads.map((t) => {
          const jumpHref = t.other.username
            ? `/dashboard/chats?user=${encodeURIComponent(t.other.username)}`
            : `/dashboard/chats`
          return (
            <Link
              key={t.conversationId}
              href={jumpHref}
              className="flex items-start gap-3 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/40"
            >
              <Avatar className="size-9 shrink-0">
                <AvatarImage
                  src={t.other.avatar ?? undefined}
                  alt={t.other.name}
                />
                <AvatarFallback>{t.other.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {t.other.name}
                  </p>
                  <Badge variant="default" className="text-[10px]">
                    {t.unreadCount}
                  </Badge>
                </div>
                {t.previews.length > 0 && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {t.previews
                      .map(
                        (p) =>
                          `${p.from === "me" ? "You: " : ""}${p.content}`,
                      )
                      .join("  ·  ")}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
