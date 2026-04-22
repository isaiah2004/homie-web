"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { BellIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  })
}

export function NotificationBell() {
  const { devUserId, isDevMode, isLoaded } = useActiveUser()
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  // Skip queries until we have a resolved viewer. In dev mode this means
  // waiting for the localStorage read + a picked user. In prod we just
  // need Clerk to finish loading.
  const skip = isDevMode ? !devUserId : !isLoaded

  const notifications = useQuery(
    api.notifications.listNotifications,
    skip
      ? "skip"
      : { limit: 20, ...(isDevMode && devUserId ? { devUserId } : {}) },
  )
  const unread = useQuery(
    api.notifications.unreadCount,
    skip ? "skip" : isDevMode && devUserId ? { devUserId } : {},
  )

  const markRead = useIdentifiedMutation(api.notifications.markRead)
  const markAllRead = useIdentifiedMutation(api.notifications.markAllRead)

  const unreadCount = unread ?? 0
  const countLabel = unreadCount > 99 ? "99+" : String(unreadCount)

  async function handleClickRow(n: Doc<"notifications">) {
    if (!n.read) {
      await markRead({ notificationIds: [n._id] }).catch(() => {
        // silent — nav still proceeds even if mark fails
      })
    }
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="relative"
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center",
                "rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white",
              )}
            >
              {countLabel}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <Button
            variant="ghost"
            size="xs"
            disabled={unreadCount === 0}
            onClick={() => markAllRead({}).catch(() => {})}
          >
            Mark all read
          </Button>
        </div>
        <Separator />
        <ScrollArea className="max-h-96">
          {notifications === undefined ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => handleClickRow(n)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors",
                      "hover:bg-muted/50",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <Separator />
        <div className="px-3 py-2">
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
