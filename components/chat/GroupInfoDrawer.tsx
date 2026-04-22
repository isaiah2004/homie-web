"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import {
  CrownIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  ShieldIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function GroupInfoDrawer({
  groupChatId,
  members,
  myRole,
  myUserId,
  memberCount,
  onAddMemberClick,
  onDeleted,
}: {
  groupChatId: Id<"groupChats">
  members: Array<{
    membership: Doc<"groupChatMembers">
    user: Doc<"users"> | null
  }>
  myRole: "admin" | "member"
  myUserId: Id<"users">
  memberCount: number
  onAddMemberClick: () => void
  onDeleted: () => void
}) {
  const promote = useIdentifiedMutation(api.groupChats.promoteToAdmin)
  const demote = useIdentifiedMutation(api.groupChats.demoteToMember)
  const remove = useIdentifiedMutation(api.groupChats.removeMember)
  const leave = useIdentifiedMutation(api.groupChats.leaveGroupChat)
  const deleteGroup = useIdentifiedMutation(api.groupChats.deleteGroupChat)

  async function handlePromote(targetUserId: Id<"users">) {
    try {
      await promote({ groupChatId, targetUserId })
      toast.success("Promoted to admin")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleDemote(targetUserId: Id<"users">) {
    try {
      await demote({ groupChatId, targetUserId })
      toast.success("Demoted to member")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleRemove(targetUserId: Id<"users">) {
    try {
      await remove({ groupChatId, targetUserId })
      toast.success("Removed from group")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleLeave() {
    try {
      await leave({ groupChatId })
      toast.success("You left the group")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleDelete() {
    try {
      await deleteGroup({ groupChatId })
      toast.success("Group deleted")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  // Sort admins first, then by addedAt (oldest first).
  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.membership.role !== b.membership.role) {
        return a.membership.role === "admin" ? -1 : 1
      }
      return a.membership.addedAt - b.membership.addedAt
    })
  }, [members])

  const iAmAdmin = myRole === "admin"

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 border-b shrink-0 flex items-center gap-2">
        <UsersIcon className="size-4 text-muted-foreground" />
        <h3 className="font-semibold">Group info</h3>
        <Badge variant="outline" className="ml-auto text-xs">
          {memberCount} member{memberCount === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {iAmAdmin && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onAddMemberClick}
          >
            <UserPlusIcon className="size-4 mr-2" />
            Add member
          </Button>
        )}
        <Separator />
        <div className="space-y-1">
          {sortedMembers.map(({ membership, user }) =>
            user ? (
              <MemberRow
                key={membership._id}
                user={user}
                role={membership.role}
                isSelf={user._id === myUserId}
                canManage={iAmAdmin && user._id !== myUserId}
                onPromote={() => handlePromote(user._id)}
                onDemote={() => handleDemote(user._id)}
                onRemove={() => handleRemove(user._id)}
              />
            ) : null,
          )}
        </div>
      </div>

      <div className="p-3 border-t shrink-0 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleLeave}
        >
          <LogOutIcon className="size-4 mr-2" />
          Leave group
        </Button>
        {iAmAdmin && memberCount === 1 && (
          <Button
            variant="destructive"
            className="w-full justify-start"
            onClick={handleDelete}
          >
            <Trash2Icon className="size-4 mr-2" />
            Delete group
          </Button>
        )}
      </div>
    </div>
  )
}

function MemberRow({
  user,
  role,
  isSelf,
  canManage,
  onPromote,
  onDemote,
  onRemove,
}: {
  user: Doc<"users">
  role: "admin" | "member"
  isSelf: boolean
  canManage: boolean
  onPromote: () => void
  onDemote: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40">
      <Link
        href={`/dashboard/profile/${user._id}`}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold shrink-0">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {user.name}
              {isSelf && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (you)
                </span>
              )}
            </p>
            {role === "admin" && (
              <Badge
                variant="secondary"
                className="text-[10px] inline-flex items-center gap-0.5"
              >
                <CrownIcon className="size-2.5" />
                Admin
              </Badge>
            )}
          </div>
          {user.username && (
            <p className="text-xs text-muted-foreground truncate">
              @{user.username}
            </p>
          )}
        </div>
      </Link>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Manage member"
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <MoreHorizontalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {role === "member" ? (
              <DropdownMenuItem onSelect={onPromote}>
                <ShieldIcon className="size-3.5 mr-2" />
                Promote to admin
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={onDemote}>
                <ShieldIcon className="size-3.5 mr-2" />
                Demote to member
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onRemove} variant="destructive">
              <UserMinusIcon className="size-3.5 mr-2" />
              Remove from group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
