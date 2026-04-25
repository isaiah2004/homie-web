"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  HeartIcon,
  PlusIcon,
  ShieldIcon,
  UserPlusIcon,
  UsersIcon,
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

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function ageFromDob(dob: string | undefined): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const d = new Date(`${dob}T00:00:00Z`)
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--
  return age
}

export default function Page() {
  const activeUser = useActiveUser()

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const children = useQuery(
    api.family.listMyChildren,
    skip ? "skip" : identityArg,
  )
  const pendingInvites = useQuery(
    api.family.listPendingParentInvites,
    skip ? "skip" : identityArg,
  )

  const acceptInvite = useIdentifiedMutation(api.family.acceptParentInvite)
  const declineInvite = useIdentifiedMutation(api.family.declineParentInvite)
  const [busyInvite, setBusyInvite] = React.useState<
    Id<"familyLinks"> | null
  >(null)

  async function handleAccept(linkId: Id<"familyLinks">) {
    setBusyInvite(linkId)
    try {
      await acceptInvite({ linkId })
      toast.success("Invite accepted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyInvite(null)
    }
  }
  async function handleDecline(linkId: Id<"familyLinks">) {
    setBusyInvite(linkId)
    try {
      await declineInvite({ linkId })
      toast.success("Invite declined")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyInvite(null)
    }
  }

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Family Center" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="family" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell header={<SiteHeader pageName="Family Center" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Family Center</h2>
              <p className="text-sm text-muted-foreground">
                Supervise child accounts and link spouses.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/dashboard/family/spouse">
                  <HeartIcon className="size-4" />
                  Manage spouses
                </Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/family/new-child">
                  <PlusIcon className="size-4" />
                  Add child
                </Link>
              </Button>
            </div>
          </div>

          {/* Pending invites — surface above children since they're actionable. */}
          {pendingInvites && pendingInvites.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Pending guardian invites</h3>
              <p className="text-xs text-muted-foreground">
                Someone has invited you to co-manage their child.
              </p>
              <ul className="mt-3 space-y-2">
                {pendingInvites.map(({ link, child, invitedBy }) => {
                  const busy = busyInvite === link._id
                  return (
                    <li
                      key={link._id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
                        {initials(child?.name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {child?.name ?? "Unknown child"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invitedBy?.name
                            ? `Invited by ${invitedBy.name}`
                            : "You've been invited as a guardian"}{" "}
                          · role:{" "}
                          <span className="font-medium">{link.parentRole}</span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => handleAccept(link._id)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handleDecline(link._id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Your children</h3>
            {children === undefined ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            ) : children.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed p-8 text-center">
                <ShieldIcon className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">
                  Family Center
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Supervise child accounts with curated metadata views (never
                  message content), grant co-parents access, and link spouses
                  for shared calendar visibility.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" asChild>
                    <Link href="/dashboard/family/new-child">
                      <UserPlusIcon className="size-3.5" />
                      Add a child
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/dashboard/family/spouse">
                      <HeartIcon className="size-3.5" />
                      Link a spouse
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {children.map(
                  ({ child, link, settings, pendingApprovalCount }) => {
                    const age = ageFromDob(child.dob ?? undefined)
                    const ageBand = settings?.ageBand ?? null
                    return (
                      <div
                        key={child._id}
                        className="flex flex-col overflow-hidden rounded-lg border bg-card"
                      >
                        <div className="flex flex-1 items-start gap-3 p-4">
                          {child.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={child.avatar}
                              alt=""
                              className="size-12 rounded-md border object-cover"
                            />
                          ) : (
                            <div className="flex size-12 items-center justify-center rounded-md border bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-semibold text-white">
                              {initials(child.name)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {child.name}
                            </p>
                            {child.username && (
                              <p className="truncate text-xs text-muted-foreground">
                                @{child.username}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {age !== null && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  Age {age}
                                </Badge>
                              )}
                              {ageBand && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {ageBand === "under_12"
                                    ? "Under 12"
                                    : "12+"}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {link.parentRole}
                              </Badge>
                              {pendingApprovalCount > 0 && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px]"
                                >
                                  {pendingApprovalCount} pending
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 border-t p-3">
                          <Button size="sm" className="flex-1" asChild>
                            <Link href={`/dashboard/family/${child._id}`}>
                              Open
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )
                  },
                )}
              </div>
            )}
          </div>

          <div className="mt-8 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium">
                  Privacy-first supervision
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Guardians see metadata (friends, communities, activity) but
                  never message content. Every view and setting change is
                  logged so your child can see exactly what you can do.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
