"use client"

// Child-side supervision dashboard.
//
// Renders a transparent view of the supervision setup for an account marked
// `isChild === true`:
//   - Who their guardians are (with role chips)
//   - Which `parentSeesX` toggles are on (so the child knows exactly what
//     metadata is exposed)
//   - Which restrictions are active (friend/community approval, DM controls,
//     content filter, voice chat, agent access)
//   - Pending cross-band requests they've made
//   - The audit log mirrored from the parent side (who did what, when)
//
// Non-child viewers see a friendly "you're not in a family group" empty
// state — the page is publicly linkable from the sidebar but does nothing
// surveillance-y for adults.

import * as React from "react"
import Link from "next/link"
import {
  CheckIcon,
  XIcon,
  ShieldCheckIcon,
  EyeIcon,
  ClockIcon,
  UserCheckIcon,
  AlertCircleIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedQuery } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"
import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Default flag map (mirrors `convex/_lib/childPolicy.ts:DEFAULT_FLAGS`).
//
// Duplicated here because that module imports Convex types and lives under
// the server-only `convex/` tree. The two should stay in sync — if a new
// flag is added to the policy resolver, it needs a default + label here too.
// ─────────────────────────────────────────────────────────────────────────────

type AgeBand = "under_12" | "12_plus"
type FlagKey =
  | "friendApprovalRequired"
  | "communityApprovalRequired"
  | "blockNonFriendDms"
  | "discoverabilityRestricted"
  | "contentFilterPg13"
  | "voiceChatAllowed"
  | "agentDisabled"
  | "agentRestricted"
  | "nightLockEnabled"
  | "parentSeesFriends"
  | "parentSeesDmPartners"
  | "parentSeesCommunities"
  | "parentSeesActivity"
  | "parentSeesProfile"
  | "calendarVisibleToParents"
  | "unlinkAt18"
  | "accountLocked"

const DEFAULT_FLAGS: Record<AgeBand, Record<FlagKey, boolean>> = {
  under_12: {
    friendApprovalRequired: true,
    communityApprovalRequired: true,
    blockNonFriendDms: true,
    discoverabilityRestricted: true,
    contentFilterPg13: true,
    voiceChatAllowed: false,
    agentDisabled: false,
    agentRestricted: true,
    nightLockEnabled: false,
    parentSeesFriends: true,
    parentSeesDmPartners: true,
    parentSeesCommunities: true,
    parentSeesActivity: true,
    parentSeesProfile: true,
    calendarVisibleToParents: true,
    unlinkAt18: true,
    accountLocked: false,
  },
  "12_plus": {
    friendApprovalRequired: true,
    communityApprovalRequired: false,
    blockNonFriendDms: true,
    discoverabilityRestricted: true,
    contentFilterPg13: true,
    voiceChatAllowed: true,
    agentDisabled: false,
    agentRestricted: false,
    nightLockEnabled: false,
    parentSeesFriends: true,
    parentSeesDmPartners: true,
    parentSeesCommunities: true,
    parentSeesActivity: true,
    parentSeesProfile: false,
    calendarVisibleToParents: true,
    unlinkAt18: true,
    accountLocked: false,
  },
}

function resolveFlag(
  band: AgeBand,
  stored: Doc<"childSettings">["flags"] | undefined,
  key: FlagKey,
): boolean {
  if (stored && typeof stored[key] === "boolean") return Boolean(stored[key])
  return DEFAULT_FLAGS[band][key]
}

// ─────────────────────────────────────────────────────────────────────────────
// Display copy
// ─────────────────────────────────────────────────────────────────────────────

const SEES_ROWS: Array<{ key: FlagKey; label: string; description: string }> = [
  {
    key: "parentSeesFriends",
    label: "Friends",
    description: "Your friends list (names only)",
  },
  {
    key: "parentSeesDmPartners",
    label: "DM partners",
    description: "Recent DM contacts (no message contents)",
  },
  {
    key: "parentSeesCommunities",
    label: "Communities",
    description: "Communities you're in",
  },
  {
    key: "parentSeesActivity",
    label: "Activity feed",
    description: "Your activity feed (joined community, RSVPed event, etc.)",
  },
  {
    key: "parentSeesProfile",
    label: "Profile",
    description: "Your profile bio, location, visibility settings",
  },
]

// Each row is rendered ON when its underlying flag is `true`. The
// `voiceChatAllowed` flag is inverted ("voice chat" is restricted when the
// allowed flag is false), so we capture that with an explicit invert flag
// rather than threading negation through the renderer.
const RESTRICT_ROWS: Array<{
  key: FlagKey
  label: string
  description: string
  invert?: boolean
}> = [
  {
    key: "friendApprovalRequired",
    label: "Friend approval",
    description: "New friend requests need a guardian's OK",
  },
  {
    key: "communityApprovalRequired",
    label: "Community approval",
    description: "Joining a community needs a guardian's OK",
  },
  {
    key: "blockNonFriendDms",
    label: "DM controls",
    description: "Only friends can send you DMs",
  },
  {
    key: "contentFilterPg13",
    label: "Content filter",
    description: "PG-13 filter is on across feeds and chats",
  },
  {
    key: "voiceChatAllowed",
    label: "Voice chat",
    description: "Voice chat is locked",
    invert: true,
  },
  {
    key: "agentDisabled",
    label: "Homie agent",
    description: "The Homie AI agent is disabled",
  },
  {
    key: "agentRestricted",
    label: "Agent access",
    description: "Some Homie agent tools are restricted",
  },
]

const SCOPE_LABEL: Record<Doc<"crossBandRequests">["scope"], string> = {
  dm: "Direct message",
  groupchat: "Group chat",
  friend: "Friend request",
  community: "Community join",
}

const STATUS_VARIANT: Record<
  Doc<"crossBandRequests">["status"],
  "secondary" | "default" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  denied: "destructive",
  revoked: "outline",
}

const ROLE_CHIP: Record<"primary" | "co_parent" | "step_parent", string> = {
  primary: "Primary",
  co_parent: "Co-parent",
  step_parent: "Step-parent",
}

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

// Render a free-text audit action key into something a child can read.
// Falls back to a humanized form of the key for any action we haven't
// special-cased — keeps the timeline working when new audit actions are
// added without this page being touched.
function actionLabel(action: string, meta?: Record<string, unknown>): string {
  switch (action) {
    case "created_child_account":
      return "set up your account"
    case "invited_guardian":
      return "invited a guardian"
    case "accepted_guardian_invite":
      return "accepted a guardian invite"
    case "revoked_guardian":
      return "removed a guardian"
    case "changed_guardian_role":
      return "changed a guardian's role"
    case "updated_flags": {
      const flags =
        meta && typeof meta === "object" && "flags" in meta
          ? (meta as { flags?: Record<string, unknown> }).flags
          : undefined
      const keys = flags ? Object.keys(flags) : []
      if (keys.length === 0) return "updated your settings"
      return `updated settings (${keys.join(", ")})`
    }
    case "set_timezone":
      return "set your timezone"
    case "set_night_lock_window":
      return "updated the night lock window"
    case "blocked_user":
      return "blocked a user"
    case "unblocked_user":
      return "unblocked a user"
    case "blocked_community":
      return "blocked a community"
    case "unblocked_community":
      return "unblocked a community"
    case "locked_account":
      return "locked your account"
    case "unlocked_account":
      return "unlocked your account"
    case "approved_request":
      return "approved a request"
    case "denied_request":
      return "denied a request"
    case "viewed_friends":
      return "viewed your friends list"
    case "viewed_dm_partners":
      return "viewed your DM partners"
    case "viewed_communities":
      return "viewed your communities"
    case "viewed_activity":
      return "viewed your activity"
    case "viewed_profile":
      return "viewed your profile"
    case "viewed_calendar":
      return "viewed your calendar"
    default:
      return action.replace(/_/g, " ")
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page shell helpers
// ─────────────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell header={<SiteHeader pageName="Supervision" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </PageShell>
  )
}

function NotInFamily() {
  return (
    <Shell>
      <div className="mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 pb-6 text-center">
            <ShieldCheckIcon className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              You&apos;re not in a family group
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              This page shows what your guardian can see and the controls they
              have set. It only applies to accounts that have been added to a
              family by a parent.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/dashboard/profile">Back to profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

function FlagRow({
  on,
  label,
  description,
}: {
  on: boolean
  label: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full",
          on
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {on ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {on ? "On" : "Off"}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Page() {
  const activeUser = useActiveUser()

  // Both child + non-child cases call `getMySupervision`. It returns null if
  // the caller isn't a child — we show the "no family group" state below.
  // The query depends on identity resolution, so skip until the active-user
  // hook reports loaded.
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded

  const supervision = useIdentifiedQuery(
    api.family.getMySupervision,
    skip ? "skip" : {},
  )

  // The audit log is gated on the supervision query returning a child row —
  // we only know the childId once `supervision` resolves with a `me`.
  const childId = supervision?.me._id
  const auditLog = useIdentifiedQuery(
    api.family.listAuditLog,
    childId ? { childId, limit: 50 } : "skip",
  )

  // Pending requests are scoped to the calling child — no extra args needed.
  const pendingRequests = useIdentifiedQuery(
    api.crossBandRequests.listMyPending,
    skip || !supervision ? "skip" : {},
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <Shell>
        <PickDevUserEmptyState pageName="supervision" />
      </Shell>
    )
  }

  if (supervision === undefined) {
    return (
      <Shell>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </Shell>
    )
  }

  if (supervision === null) {
    return <NotInFamily />
  }

  const { settings, guardians, childAge } = supervision
  const ageBand: AgeBand = childAge >= 12 ? "12_plus" : "under_12"
  const storedFlags = settings?.flags

  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-6">
        {/* Header — who supervises this account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-4" />
              Supervised by{" "}
              {guardians
                .map((g) => g.user?.name)
                .filter(Boolean)
                .join(", ") || "your guardian"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active guardians yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {guardians.map((g, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card/50 px-3 py-2"
                  >
                    <span className="text-sm font-medium">
                      {g.user?.name ?? "Unknown guardian"}
                    </span>
                    <Badge variant="outline">{ROLE_CHIP[g.role]}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              Age {Number.isFinite(childAge) ? childAge : "—"} ·{" "}
              {ageBand === "under_12" ? "Under 12" : "12 and up"}
            </p>
          </CardContent>
        </Card>

        {/* What guardians can see */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <EyeIcon className="size-4" />
              What your guardians can see
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {SEES_ROWS.map((row) => (
                <FlagRow
                  key={row.key}
                  on={resolveFlag(ageBand, storedFlags, row.key)}
                  label={row.label}
                  description={row.description}
                />
              ))}
            </div>
            <p className="pt-3 text-xs text-muted-foreground">
              Your guardians never see the contents of your messages — only
              metadata, and only the rows marked &quot;On&quot; above.
            </p>
          </CardContent>
        </Card>

        {/* What's restricted */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheckIcon className="size-4" />
              What&apos;s restricted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {RESTRICT_ROWS.map((row) => {
                const raw = resolveFlag(ageBand, storedFlags, row.key)
                const on = row.invert ? !raw : raw
                return (
                  <FlagRow
                    key={row.key}
                    on={on}
                    label={row.label}
                    description={row.description}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pending approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClockIcon className="size-4" />
              Pending approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequests === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don&apos;t have any pending requests.
              </p>
            ) : (
              <ul className="divide-y">
                {pendingRequests.map((req) => (
                  <li
                    key={req.row._id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {SCOPE_LABEL[req.row.scope]} ·{" "}
                        {req.other?.name ?? "someone"}
                      </p>
                      {req.row.reason && (
                        <p className="truncate text-xs text-muted-foreground">
                          {req.row.reason}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {timeAgo(req.row.createdAt)}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[req.row.status]}>
                      {req.row.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Audit log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircleIcon className="size-4" />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLog === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has happened yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {auditLog.map((entry, idx) => (
                  <li key={entry.row._id}>
                    <div className="flex items-start gap-3 py-2">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">
                            {entry.actor?.name ?? "Someone"}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {actionLabel(entry.row.action, entry.row.meta)}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {timeAgo(entry.row.createdAt)}
                        </p>
                      </div>
                    </div>
                    {idx < auditLog.length - 1 && <Separator />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

