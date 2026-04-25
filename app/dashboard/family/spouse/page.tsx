"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { ArrowLeftIcon, HeartIcon, MailIcon, XIcon } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

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

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const links = useQuery(
    api.spouse.listMySpouseLinks,
    skip ? "skip" : identityArg,
  )

  const inviteSpouse = useIdentifiedMutation(api.spouse.inviteSpouse)
  const acceptInvite = useIdentifiedMutation(api.spouse.acceptSpouseInvite)
  const declineInvite = useIdentifiedMutation(api.spouse.declineSpouseInvite)
  const setShare = useIdentifiedMutation(api.spouse.setSpouseCalendarShare)
  const revoke = useIdentifiedMutation(api.spouse.revokeSpouseLink)

  const [email, setEmail] = React.useState("")
  const [busyLink, setBusyLink] = React.useState<Id<"spouseLinks"> | null>(
    null,
  )
  const [submitting, setSubmitting] = React.useState(false)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Spouse links" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="family" />
        </div>
      </PageShell>
    )
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error("Enter an email address")
      return
    }
    setSubmitting(true)
    try {
      const res = await inviteSpouse({ targetEmail: trimmed })
      if (res.status === "alreadyInvited") {
        toast.info("That invite was already sent")
      } else if (res.status === "reinvited") {
        toast.success("Invite re-sent")
      } else {
        toast.success("Invite sent")
      }
      setEmail("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAccept(linkId: Id<"spouseLinks">) {
    setBusyLink(linkId)
    try {
      await acceptInvite({ linkId })
      toast.success("Spouse link accepted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyLink(null)
    }
  }

  async function handleDecline(linkId: Id<"spouseLinks">) {
    setBusyLink(linkId)
    try {
      await declineInvite({ linkId })
      toast.success("Invite declined")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyLink(null)
    }
  }

  async function handleCancel(linkId: Id<"spouseLinks">) {
    setBusyLink(linkId)
    try {
      // Re-uses declineSpouseInvite — server-side it just sets status to revoked
      // and the sender is allowed to do that on their pending row.
      await declineInvite({ linkId })
      toast.success("Invite cancelled")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyLink(null)
    }
  }

  async function handleRevoke(linkId: Id<"spouseLinks">) {
    if (!confirm("Remove this spouse link?")) return
    setBusyLink(linkId)
    try {
      await revoke({ linkId })
      toast.success("Spouse link removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyLink(null)
    }
  }

  async function handleToggleShare(
    linkId: Id<"spouseLinks">,
    enabled: boolean,
  ) {
    try {
      await setShare({ linkId, enabled })
      toast.success(
        enabled ? "Calendar sharing enabled" : "Calendar sharing disabled",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  const active = (links ?? []).filter((l) => l.link.status === "active")
  const incoming = (links ?? []).filter(
    (l) => l.link.status === "pending" && l.direction === "incoming",
  )
  const outgoing = (links ?? []).filter(
    (l) => l.link.status === "pending" && l.direction === "outgoing",
  )

  return (
    <PageShell header={<SiteHeader pageName="Spouse links" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/family">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-base font-semibold">Spouse links</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Link with your spouse for shared Homie-event calendar
              visibility. Each side independently controls whether to share.
            </p>

            <form onSubmit={handleInvite} className="mt-4 flex gap-2">
              <div className="flex-1">
                <Label htmlFor="spouse-email" className="sr-only">
                  Spouse email
                </Label>
                <Input
                  id="spouse-email"
                  type="email"
                  placeholder="spouse@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting}>
                <HeartIcon className="size-4" />
                Invite
              </Button>
            </form>
          </div>

          {incoming.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Incoming invites</h3>
              <ul className="mt-2 space-y-2">
                {incoming.map(({ link, otherUser }) => {
                  const busy = busyLink === link._id
                  return (
                    <li
                      key={link._id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-600 text-xs font-semibold text-white">
                        {initials(otherUser?.name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {otherUser?.name ?? "Unknown user"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {otherUser?.email ?? ""}
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

          {outgoing.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Outgoing invites</h3>
              <ul className="mt-2 space-y-2">
                {outgoing.map(({ link, otherUser }) => {
                  const busy = busyLink === link._id
                  return (
                    <li
                      key={link._id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-600 text-xs font-semibold text-white">
                        {initials(otherUser?.name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {otherUser?.name ?? "Unknown user"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Waiting for them to accept
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleCancel(link._id)}
                      >
                        <XIcon className="size-4" />
                        Cancel
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Active spouses</h3>
            {links === undefined ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            ) : active.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed p-6 text-center">
                <MailIcon className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">
                  No active spouse links
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Send an invite above to get started.
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {active.map(
                  ({ link, otherUser, mySharesEnabled, otherSharesEnabled }) => {
                    const busy = busyLink === link._id
                    return (
                      <li
                        key={link._id}
                        className="rounded-lg border bg-card p-4"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-600 text-xs font-semibold text-white">
                            {initials(otherUser?.name ?? "?")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {otherUser?.name ?? "Unknown user"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {otherUser?.email ?? ""}
                            </p>
                          </div>
                          <Badge
                            variant={
                              otherSharesEnabled ? "secondary" : "outline"
                            }
                            className="text-[10px]"
                          >
                            {otherSharesEnabled
                              ? "They share with you"
                              : "They aren't sharing"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => handleRevoke(link._id)}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="mt-3 flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                          <Switch
                            id={`share-${link._id}`}
                            checked={mySharesEnabled}
                            onCheckedChange={(checked) =>
                              handleToggleShare(link._id, checked)
                            }
                          />
                          <div className="flex-1">
                            <Label
                              htmlFor={`share-${link._id}`}
                              className="text-sm font-medium"
                            >
                              Share my calendar with{" "}
                              {otherUser?.name ?? "them"}
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              When on, your spouse can see your Homie events
                              + RSVPs.
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  },
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
