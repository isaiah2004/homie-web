"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  MailIcon,
  MinusCircleIcon,
  SearchIcon,
  UserPlusIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontalIcon } from "lucide-react"

type AssignableRole = "admin" | "manager" | "employee"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export default function Page() {
  const activeUser = useActiveUser()
  const params = useParams<{ id: string }>()
  const businessId = params.id as Id<"businesses">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const viewerData = useQuery(
    api.businesses.getBusinessForViewer,
    skip ? "skip" : { businessId, ...identityArg },
  )
  const memberData = useQuery(
    api.businessMembers.listMembers,
    skip ? "skip" : { businessId, ...identityArg },
  )

  const removeMember = useIdentifiedMutation(api.businessMembers.removeMember)
  const updateRole = useIdentifiedMutation(api.businessMembers.updateMemberRole)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Members" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="businesses" />
        </div>
      </PageShell>
    )
  }

  if (viewerData === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Members" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  // Short-circuit for non-members up front so `listMembers` (which throws
  // for non-members) never gets stuck in a pending state on this page.
  if (viewerData === null || viewerData.myRole === null) {
    return (
      <PageShell header={<SiteHeader pageName="Members" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Not allowed</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You don&apos;t have access to this business.
              </p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/businesses">Back to businesses</Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (memberData === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Members" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  const canManage = memberData.myRole === "owner" || memberData.myRole === "admin"
  const existingMemberIds = new Set(
    memberData.members.map((m) => m.membership.userId),
  )

  async function handleRemove(userId: Id<"users">, name: string) {
    if (!confirm(`Remove ${name} from this business?`)) return
    try {
      await removeMember({ businessId, targetUserId: userId })
      toast.success(`Removed ${name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  async function handleUpdateRole(
    userId: Id<"users">,
    newRole: AssignableRole,
  ) {
    try {
      await updateRole({
        businessId,
        targetUserId: userId,
        newRole,
      })
      toast.success("Role updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="Members" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <h2 className="text-base font-semibold">
                  Members ({memberData.members.length})
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Owner and admins can add, remove, and change roles.
                </p>
              </div>
              {canManage && (
                <AddMemberDialog
                  businessId={businessId}
                  existingMemberIds={existingMemberIds}
                />
              )}
            </div>
            <Separator />
            <ul className="divide-y">
              {memberData.members.map(({ membership, user }) => {
                if (!user) return null
                const isMe = membership.userId === memberData.myUserId
                const isOwner = membership.role === "owner"
                return (
                  <li
                    key={membership._id}
                    className="flex items-center gap-3 p-4"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-xs font-semibold text-white">
                      {initials(user.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user.name}
                        {isMe && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </p>
                      {user.username && (
                        <p className="truncate text-xs text-muted-foreground">
                          @{user.username}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={isOwner ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {membership.role}
                    </Badge>
                    {canManage && !isOwner && !isMe && (
                      <MemberActions
                        name={user.name}
                        currentRole={
                          membership.role as "admin" | "manager" | "employee"
                        }
                        onRemove={() =>
                          handleRemove(membership.userId, user.name)
                        }
                        onChangeRole={(r) =>
                          handleUpdateRole(membership.userId, r)
                        }
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

function MemberActions({
  name,
  currentRole,
  onRemove,
  onChangeRole,
}: {
  name: string
  currentRole: AssignableRole
  onRemove: () => void
  onChangeRole: (r: AssignableRole) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {(["admin", "manager", "employee"] as const)
          .filter((r) => r !== currentRole)
          .map((r) => (
            <DropdownMenuItem
              key={r}
              onSelect={() => onChangeRole(r)}
            >
              Make {r}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onRemove}
          variant="destructive"
        >
          <MinusCircleIcon className="size-3.5 mr-2" />
          Remove {name}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-member dialog — supports both friend picker + email fallback.
// ─────────────────────────────────────────────────────────────────────────────

function AddMemberDialog({
  businessId,
  existingMemberIds,
}: {
  businessId: Id<"businesses">
  existingMemberIds: Set<Id<"users">>
}) {
  const activeUser = useActiveUser()
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<"friends" | "email">("friends")

  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)
  React.useEffect(() => {
    if (activeUser.isDevMode) {
      setViewerId(activeUser.devUserId)
    }
  }, [activeUser.isDevMode, activeUser.devUserId])

  const friends = useQuery(
    api.friends.listFriends,
    viewerId ? { userId: viewerId } : "skip",
  )

  const [search, setSearch] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<AssignableRole>("employee")
  const [submitting, setSubmitting] = React.useState(false)

  const addMember = useIdentifiedMutation(api.businessMembers.addMember)
  const addMemberByEmail = useIdentifiedMutation(
    api.businessMembers.addMemberByEmail,
  )

  const candidates = (friends ?? []).filter(
    (f) =>
      f.friend &&
      !existingMemberIds.has(f.friend._id) &&
      (!search.trim() ||
        f.friend.name
          .toLowerCase()
          .includes(search.trim().toLowerCase()) ||
        (f.friend.username ?? "")
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  )

  async function handleAddById(userId: Id<"users">) {
    setSubmitting(true)
    try {
      await addMember({ businessId, targetUserId: userId, role })
      toast.success("Added to business")
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddByEmail() {
    if (!email.trim()) {
      toast.error("Email is required")
      return
    }
    setSubmitting(true)
    try {
      await addMemberByEmail({ businessId, email: email.trim(), role })
      toast.success("Added to business")
      setOpen(false)
      setEmail("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon className="size-4" />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>
            Pick a friend or add by email. They&apos;ll be notified immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={mode === "friends" ? "default" : "ghost"}
            onClick={() => setMode("friends")}
          >
            <SearchIcon className="size-3.5" />
            Friends
          </Button>
          <Button
            size="sm"
            variant={mode === "email" ? "default" : "ghost"}
            onClick={() => setMode("email")}
          >
            <MailIcon className="size-3.5" />
            By email
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Role</p>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as AssignableRole)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "friends" ? (
          <>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search friends…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="max-h-80">
              <div className="space-y-1">
                {friends === undefined ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No friends left to add. Use the email tab.
                  </p>
                ) : (
                  candidates.map(({ friend }) =>
                    friend ? (
                      <button
                        key={friend._id}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleAddById(friend._id)}
                        className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted/50 disabled:opacity-60"
                      >
                        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-xs font-semibold text-white">
                          {initials(friend.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {friend.name}
                          </p>
                          {friend.username && (
                            <p className="truncate text-xs text-muted-foreground">
                              @{friend.username}
                            </p>
                          )}
                        </div>
                      </button>
                    ) : null,
                  )
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="person@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              They need to already have a Homie account.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {mode === "email" && (
            <Button onClick={handleAddByEmail} disabled={submitting}>
              Add
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

