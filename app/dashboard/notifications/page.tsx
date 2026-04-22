"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"

import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

function timeAgo(t: number): string {
  const diff = Date.now() - t
  if (diff < 60_000) return "just now"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// Human-readable label for each notification type. Unknown types fall back
// to a generic "Update" chip so surfaces keep working when future PRs emit
// new types before this file is updated.
function typeLabel(type: Doc<"notifications">["type"]): string {
  switch (type) {
    case "event_invite":
      return "Event invite"
    case "event_accepted":
      return "RSVP accepted"
    case "event_declined":
      return "RSVP declined"
    case "event_cancelled":
      return "Event cancelled"
    case "event_updated":
      return "Event updated"
    case "community_join_request":
      return "Join request"
    case "community_request_accepted":
      return "Request accepted"
    case "community_request_declined":
      return "Request declined"
    case "community_announcement":
      return "Announcement"
    case "community_role_changed":
    case "business_role_changed":
      return "Role changed"
    case "community_removed":
      return "Removed"
    case "business_member_invite":
      return "Team invite"
    case "ad_approved":
      return "Ad approved"
    case "ad_rejected":
      return "Ad rejected"
    default:
      return "Update"
  }
}

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded

  const notifications = useQuery(
    api.notifications.listNotifications,
    skip
      ? "skip"
      : {
          limit: 100,
          ...(activeUser.isDevMode && activeUser.devUserId
            ? { devUserId: activeUser.devUserId }
            : {}),
        },
  )

  const markRead = useIdentifiedMutation(api.notifications.markRead)
  const markAllRead = useIdentifiedMutation(api.notifications.markAllRead)

  async function handleClick(n: Doc<"notifications">) {
    if (!n.read) {
      await markRead({ notificationIds: [n._id] }).catch(() => {})
    }
    if (n.link) router.push(n.link)
  }

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Notifications" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="notifications" />
        </div>
      </PageShell>
    )
  }

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length

  return (
    <PageShell header={<SiteHeader pageName="Notifications" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main flex flex-1 flex-col gap-2 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent activity</h2>
              <p className="text-sm text-muted-foreground">
                {unreadCount === 0
                  ? "You're all caught up"
                  : `${unreadCount} unread`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={unreadCount === 0}
              onClick={() => markAllRead({}).catch(() => {})}
            >
              Mark all read
            </Button>
          </div>
          <Separator className="my-2" />
          <div className="rounded-lg border bg-card">
            {notifications === undefined ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => (
                  <li key={n._id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                        "hover:bg-muted/50",
                        !n.read && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-2 size-2 shrink-0 rounded-full",
                          n.read ? "bg-transparent" : "bg-primary",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {typeLabel(n.type)}
                          </Badge>
                          <p className="truncate text-sm font-medium">
                            {n.title}
                          </p>
                        </div>
                        {n.body && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
