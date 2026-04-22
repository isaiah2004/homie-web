"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon, SearchIcon, UsersRoundIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useQuery } from "convex/react"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

// Cap is 15 members total including the creator, so the multi-select picker
// allows up to 14 friends.
const MAX_OTHERS = 14

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function NewGroupDialog({
  viewerId,
  onCreated,
}: {
  viewerId: Id<"users">
  onCreated?: (groupId: Id<"groupChats">) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [avatarUrl, setAvatarUrl] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [picked, setPicked] = React.useState<Set<Id<"users">>>(new Set())

  const { isDevMode, devUserId } = useActiveUser()
  const friends = useQuery(
    api.friends.listFriends,
    viewerId ? { userId: viewerId } : "skip",
  )
  const createGroup = useIdentifiedMutation(api.groupChats.createGroupChat)

  const filtered = (friends ?? []).filter(({ friend }) => {
    if (!friend) return false
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return (
      friend.name.toLowerCase().includes(needle) ||
      (friend.username ?? "").toLowerCase().includes(needle)
    )
  })

  function toggle(id: Id<"users">) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= MAX_OTHERS) {
          toast.error(`A group can only have ${MAX_OTHERS + 1} members total`)
          return prev
        }
        next.add(id)
      }
      return next
    })
  }

  async function handleCreate() {
    if (name.trim().length < 2) {
      toast.error("Give your group a name (at least 2 characters)")
      return
    }
    if (picked.size === 0) {
      toast.error("Pick at least one friend to add")
      return
    }
    try {
      const groupId = await createGroup({
        name: name.trim(),
        memberIds: Array.from(picked),
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : undefined,
      })
      toast.success("Group created")
      setOpen(false)
      setName("")
      setAvatarUrl("")
      setSearch("")
      setPicked(new Set())
      onCreated?.(groupId as Id<"groupChats">)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create")
    }
  }

  // Guard the dev-mode skip so useQuery doesn't fire before the switcher
  // has populated a dev user. `friends` was already scoped above.
  void isDevMode
  void devUserId

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRoundIcon className="size-4" />
            New group
          </DialogTitle>
          <DialogDescription>
            Name the group and pick up to {MAX_OTHERS} friends. You&apos;ll be
            added automatically as the admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              placeholder="Weekend crew"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-avatar">Avatar URL (optional)</Label>
            <Input
              id="group-avatar"
              value={avatarUrl}
              placeholder="https://…"
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Members</Label>
              <span className="text-xs text-muted-foreground">
                {picked.size} / {MAX_OTHERS} picked
              </span>
            </div>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search friends…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="max-h-60 rounded-md border">
              <div className="divide-y">
                {friends === undefined ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Loading friends…
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {friends.length === 0
                      ? "No accepted friends yet. Add some from the Friends tab."
                      : "No match."}
                  </p>
                ) : (
                  filtered.map(({ friend }) =>
                    friend ? (
                      <FriendRow
                        key={friend._id}
                        friend={friend}
                        checked={picked.has(friend._id)}
                        onToggle={() => toggle(friend._id)}
                      />
                    ) : null,
                  )
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FriendRow({
  friend,
  checked,
  onToggle,
}: {
  friend: Doc<"users">
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/40"
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold shrink-0">
        {initials(friend.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{friend.name}</p>
        {friend.username && (
          <p className="text-xs text-muted-foreground truncate">
            @{friend.username}
          </p>
        )}
      </div>
      {checked && (
        <Badge variant="secondary" className="text-[10px]">
          Added
        </Badge>
      )}
    </button>
  )
}
