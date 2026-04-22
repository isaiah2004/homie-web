"use client"

import * as React from "react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useQuery } from "convex/react"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { UsersIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

// Forward-a-DM dialog. Opened by the `⋯ › Forward to group…` item on every
// DM bubble (wired up in DmPane). Renders the caller's groups and dispatches
// `api.groupChatMessages.forwardDmToGroup` on pick.
export function ForwardToGroupDialog({
  sourceMessageId,
  onOpenChange,
}: {
  sourceMessageId: Id<"directMessages"> | null
  onOpenChange: (open: boolean) => void
}) {
  const open = sourceMessageId !== null
  const { isDevMode, devUserId } = useActiveUser()

  const groups = useQuery(
    api.groupChats.listGroupChatsForUser,
    open
      ? isDevMode
        ? devUserId
          ? { devUserId }
          : "skip"
        : {}
      : "skip",
  )
  const forwardDm = useIdentifiedMutation(
    api.groupChatMessages.forwardDmToGroup,
  )

  async function handlePick(targetGroupId: Id<"groupChats">) {
    if (!sourceMessageId) return
    try {
      await forwardDm({ sourceMessageId, targetGroupId })
      toast.success("Forwarded to group")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to forward")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forward to a group</DialogTitle>
          <DialogDescription>
            Pick a group you&apos;re in. The message (and its attachments)
            will be reposted there with a forwarded-from note.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="space-y-1">
            {groups === undefined ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Loading…
              </p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                You&apos;re not in any groups yet. Create one from the Groups
                tab first.
              </p>
            ) : (
              groups.map(({ group, role, unreadCount }) => (
                <button
                  key={group._id}
                  type="button"
                  onClick={() => handlePick(group._id)}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white">
                    <UsersIcon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {group.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {group.memberCount} member
                      {group.memberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {role === "admin" && (
                      <Badge variant="outline" className="text-[10px]">
                        Admin
                      </Badge>
                    )}
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
