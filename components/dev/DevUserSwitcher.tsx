"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { DatabaseIcon, Loader2Icon, UserIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

const DEV_USER_LS_KEY = "homie_dev_user_id"
const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

function initials(name: string | undefined | null) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// Floating control shown only when NEXT_PUBLIC_DEV_MODE === "true". Lets us
// switch between seeded users (`dev_*`) and businesses (`dev_biz_*`) without
// going through Clerk. Persists the pick in localStorage so page navs retain
// the selection; a `storage` event wakes useActiveUser instances in other
// components.
export function DevUserSwitcher() {
  const [open, setOpen] = React.useState(false)
  const [currentId, setCurrentId] = React.useState<Id<"users"> | null>(null)
  const [seeding, setSeeding] = React.useState(false)

  const users = useQuery(api.users.getUsers, isDevMode ? {} : "skip")
  const seed = useMutation(api.devSeed.seedDevDataPublic)

  React.useEffect(() => {
    if (!isDevMode) return
    const read = () => {
      const v = window.localStorage.getItem(DEV_USER_LS_KEY)
      setCurrentId((v as Id<"users"> | null) ?? null)
    }
    read()
    window.addEventListener("storage", read)
    return () => window.removeEventListener("storage", read)
  }, [])

  if (!isDevMode) return null

  const devUsers = (users ?? []).filter((u) =>
    (u.username ?? "").startsWith("dev_")
  )
  const friends = devUsers.filter(
    (u) => !(u.username ?? "").startsWith("dev_biz_")
  )
  const businesses = devUsers.filter((u) =>
    (u.username ?? "").startsWith("dev_biz_")
  )

  const currentUser = devUsers.find((u) => u._id === currentId) ?? null

  const handlePick = (id: Id<"users">) => {
    window.localStorage.setItem(DEV_USER_LS_KEY, id)
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: DEV_USER_LS_KEY,
        newValue: id,
      })
    )
    setOpen(false)
    // Hard reload keeps all Convex queries in sync — some components read
    // devUserId once on mount rather than subscribing to the storage event.
    window.location.reload()
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const result = await seed({})
      toast.success(
        `Seeded: ${result.inserted} new, ${result.updated} updated`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to seed")
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-[100] h-auto gap-2 rounded-full border-amber-500/40 bg-background/95 py-2 pr-3 pl-2 shadow-lg backdrop-blur hover:border-amber-500"
        >
          <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-semibold text-white">
            {initials(currentUser?.name)}
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-xs font-medium">
              {currentUser?.name ?? "No user"}
            </span>
            <span className="text-[10px] font-semibold tracking-wider text-amber-600 dark:text-amber-400">
              DEV
            </span>
          </div>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserIcon className="size-4" />
            Dev user switcher
          </SheetTitle>
          <SheetDescription>
            Clerk is bypassed. Pick a seeded user; backend calls will run
            with their identity.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-6 pt-0">
          <Button
            variant="outline"
            onClick={handleSeed}
            disabled={seeding}
            className="gap-2"
          >
            {seeding ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DatabaseIcon className="size-4" />
            )}
            Seed dev data
          </Button>

          <Separator />

          <ScrollArea className="h-[calc(100vh-220px)] pr-2">
            <div className="flex flex-col gap-6">
              <UserGroup
                label="Friends"
                users={friends}
                currentId={currentId}
                onPick={handlePick}
              />
              <UserGroup
                label="Businesses"
                users={businesses}
                currentId={currentId}
                onPick={handlePick}
              />
              {users === undefined && (
                <p className="text-xs text-muted-foreground">Loading users…</p>
              )}
              {users !== undefined && devUsers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No seeded users yet — click{" "}
                  <span className="font-medium">Seed dev data</span> above.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function UserGroup({
  label,
  users,
  currentId,
  onPick,
}: {
  label: string
  users: Doc<"users">[]
  currentId: Id<"users"> | null
  onPick: (id: Id<"users">) => void
}) {
  if (users.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h3>
        <span className="text-xs text-muted-foreground">{users.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {users.map((u) => {
          const selected = u._id === currentId
          const bio = (u.bio ?? "").replace(/^\[BUSINESS\]\s*/, "")
          return (
            <button
              key={u._id}
              type="button"
              onClick={() => onPick(u._id)}
              className={
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 " +
                (selected
                  ? "ring-2 ring-amber-500 ring-offset-1 ring-offset-background bg-muted/40"
                  : "bg-card")
              }
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-xs font-semibold text-white">
                {initials(u.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  {selected && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      SELECTED
                    </span>
                  )}
                </div>
                {u.username && (
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                  </p>
                )}
                {bio && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {bio}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
