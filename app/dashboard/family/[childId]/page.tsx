"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  KeyRoundIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldIcon,
  UnlockIcon,
  UserPlusIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Flat list of every flag we expose, grouped by category. Mirrors the bag in
// `convex/schema.ts` `childSettings.flags`. Adding a new flag = appending one
// entry — the toggle UI auto-renders.
type FlagKey =
  // C — friend & community gates
  | "friendApprovalRequired"
  | "communityApprovalRequired"
  | "blockNonFriendDms"
  | "discoverabilityRestricted"
  // D — content
  | "contentFilterPg13"
  | "voiceChatAllowed"
  | "agentDisabled"
  | "agentRestricted"
  // E — night lock
  | "nightLockEnabled"
  // F — metadata visibility
  | "parentSeesFriends"
  | "parentSeesDmPartners"
  | "parentSeesCommunities"
  | "parentSeesActivity"
  | "parentSeesProfile"
  // Calendar
  | "calendarVisibleToParents"
  // J — recovery
  | "unlinkAt18"

type FlagSection = {
  title: string
  description: string
  flags: Array<{ key: FlagKey; label: string; help: string }>
}

const FLAG_SECTIONS: FlagSection[] = [
  {
    title: "Friends & communities",
    description: "Control how your child connects with others.",
    flags: [
      {
        key: "friendApprovalRequired",
        label: "Approve every friend request",
        help: "Friend requests route to you for approval before they're accepted.",
      },
      {
        key: "communityApprovalRequired",
        label: "Approve community joins",
        help: "Community join requests route to you for approval.",
      },
      {
        key: "blockNonFriendDms",
        label: "Block DMs from non-friends",
        help: "Only friends can DM your child.",
      },
      {
        key: "discoverabilityRestricted",
        label: "Restrict discoverability",
        help: "Hide your child from search and recommendations.",
      },
    ],
  },
  {
    title: "Content",
    description: "What your child can see and do on Homie.",
    flags: [
      {
        key: "contentFilterPg13",
        label: "PG-13 content filter",
        help: "Hide content flagged as 13+ from your child's feed.",
      },
      {
        key: "voiceChatAllowed",
        label: "Allow voice chat",
        help: "Let your child use voice features.",
      },
      {
        key: "agentDisabled",
        label: "Disable AI agent",
        help: "Turn off the in-app AI assistant entirely.",
      },
      {
        key: "agentRestricted",
        label: "Restrict AI agent",
        help: "Limit the AI agent to safer prompts and topics.",
      },
    ],
  },
  {
    title: "Night lock",
    description: "Quiet hours — only close-tier friends can chat.",
    flags: [
      {
        key: "nightLockEnabled",
        label: "Enable night lock",
        help:
          "During the configured window, only close-tier friends can DM. Others see a polite block.",
      },
    ],
  },
  {
    title: "What you can see (metadata)",
    description:
      "Which slices of your child's account you can view. You never see message content.",
    flags: [
      {
        key: "parentSeesFriends",
        label: "See friends list",
        help: "View who your child is friends with.",
      },
      {
        key: "parentSeesDmPartners",
        label: "See recent DM partners",
        help:
          "View names of people your child has messaged. You never see message content.",
      },
      {
        key: "parentSeesCommunities",
        label: "See communities",
        help: "View which communities your child belongs to.",
      },
      {
        key: "parentSeesActivity",
        label: "See activity summary",
        help: "View aggregate usage data (counts, trends).",
      },
      {
        key: "parentSeesProfile",
        label: "See profile details",
        help: "View profile fields (bio, location, etc.).",
      },
      {
        key: "calendarVisibleToParents",
        label: "See calendar",
        help: "View your child's Homie events and RSVPs.",
      },
    ],
  },
  {
    title: "Recovery",
    description: "Long-term lifecycle.",
    flags: [
      {
        key: "unlinkAt18",
        label: "Auto-unlink at 18",
        help:
          "When your child turns 18, the supervision link is automatically removed.",
      },
    ],
  },
]

// Age-band defaults — mirrors `convex/_lib/childPolicy.ts`. Used when a flag
// isn't explicitly set on settings.flags.
const AGE_BAND_DEFAULTS: Record<"under_12" | "12_plus", Record<FlagKey, boolean>> =
  {
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
    },
  }

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
  const params = useParams<{ childId: string }>()
  const childId = params.childId as Id<"users">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const overview = useQuery(
    api.family.getChildOverview,
    skip ? "skip" : { childId, ...identityArg },
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Child" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="family" />
        </div>
      </PageShell>
    )
  }

  if (overview === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Child" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  const { child, settings, guardians, pendingApprovals, childAge } = overview
  // Identify caller's role so we can gate primary-only / co_parent+ controls.
  const myUserId = activeUser.devUserId
  const myGuardian = myUserId
    ? guardians.find((g) => g.user?._id === myUserId)
    : guardians[0]
  const myRole = myGuardian?.role ?? null
  const canEditSettings = myRole === "primary" || myRole === "co_parent"
  const isPrimary = myRole === "primary"

  return (
    <PageShell header={<SiteHeader pageName={child.name} />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-4xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/family">
              <ArrowLeftIcon className="size-4" />
              Back to family
            </Link>
          </Button>

          {/* Identity / role header */}
          <div className="rounded-lg border bg-card p-6">
            <div className="flex flex-wrap items-start gap-4">
              {child.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={child.avatar}
                  alt=""
                  className="size-16 rounded-md border object-cover"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-md border bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-semibold text-white">
                  {initials(child.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-semibold">{child.name}</h1>
                {child.username && (
                  <p className="truncate text-xs text-muted-foreground">
                    @{child.username}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {!Number.isNaN(childAge) && (
                    <Badge variant="outline" className="text-[10px]">
                      Age {childAge}
                    </Badge>
                  )}
                  {settings && (
                    <Badge variant="secondary" className="text-[10px]">
                      {settings.ageBand === "under_12" ? "Under 12" : "12+"}
                    </Badge>
                  )}
                  {myRole && (
                    <Badge variant="default" className="text-[10px]">
                      You are {myRole}
                    </Badge>
                  )}
                  {pendingApprovals > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {pendingApprovals} pending approval
                      {pendingApprovals === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {settings?.flags.accountLocked && (
                    <Badge variant="destructive" className="text-[10px]">
                      Account locked
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {/* Guardians chip row */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Guardians:
              </span>
              {guardians.map((g) => (
                <Badge
                  key={g.linkId}
                  variant="outline"
                  className="text-[10px]"
                >
                  {g.user?.name ?? "Unknown"} · {g.role}
                </Badge>
              ))}
            </div>
          </div>

          <Tabs defaultValue="overview" className="mt-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="approvals">
                Approvals
                {pendingApprovals > 0 && (
                  <Badge variant="destructive" className="ml-1.5 text-[10px]">
                    {pendingApprovals}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
              <TabsTrigger value="guardians">Guardians</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab
                child={child}
                settings={settings}
                guardians={guardians}
                pendingApprovals={pendingApprovals}
                childAge={childAge}
              />
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
              <SettingsTab
                childId={childId}
                settings={settings}
                canEdit={canEditSettings}
                isPrimary={isPrimary}
              />
            </TabsContent>

            <TabsContent value="approvals" className="mt-4">
              <ApprovalsTab childId={childId} canApprove={canEditSettings} />
            </TabsContent>

            <TabsContent value="calendar" className="mt-4">
              <CalendarTab childId={childId} />
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <AuditTab childId={childId} />
            </TabsContent>

            <TabsContent value="guardians" className="mt-4">
              <GuardiansTab
                childId={childId}
                guardians={guardians}
                isPrimary={isPrimary}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview tab
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  child,
  settings,
  guardians,
  pendingApprovals,
  childAge,
}: {
  child: Doc<"users">
  settings: Doc<"childSettings"> | null
  guardians: Array<{
    user: Doc<"users"> | null
    role: "primary" | "co_parent" | "step_parent"
    linkId: Id<"familyLinks">
  }>
  pendingApprovals: number
  childAge: number
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldIcon className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Identity</p>
        </div>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="truncate font-medium">{child.name}</dd>
          </div>
          {child.username && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Username</dt>
              <dd className="truncate font-medium">@{child.username}</dd>
            </div>
          )}
          {child.dob && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Date of birth</dt>
              <dd className="font-medium">{child.dob}</dd>
            </div>
          )}
          {!Number.isNaN(childAge) && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Age</dt>
              <dd className="font-medium">{childAge}</dd>
            </div>
          )}
          {settings && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Age band</dt>
              <dd className="font-medium">
                {settings.ageBand === "under_12" ? "Under 12" : "12+"}
              </dd>
            </div>
          )}
          {settings?.childTimezone && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="truncate font-medium">{settings.childTimezone}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Pending</p>
        </div>
        <p className="mt-3 text-2xl font-semibold">{pendingApprovals}</p>
        <p className="text-xs text-muted-foreground">
          {pendingApprovals === 1
            ? "Cross-band approval waiting on you"
            : "Cross-band approvals waiting on you"}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 md:col-span-2">
        <div className="flex items-center gap-2">
          <UserPlusIcon className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Guardians</p>
        </div>
        <ul className="mt-3 divide-y">
          {guardians.map((g) => (
            <li
              key={g.linkId}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="truncate">{g.user?.name ?? "Unknown"}</span>
              <Badge variant="outline" className="text-[10px]">
                {g.role}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings tab
// ─────────────────────────────────────────────────────────────────────────────

function SettingsTab({
  childId,
  settings,
  canEdit,
  isPrimary,
}: {
  childId: Id<"users">
  settings: Doc<"childSettings"> | null
  canEdit: boolean
  isPrimary: boolean
}) {
  const updateFlags = useIdentifiedMutation(api.family.updateChildFlags)
  const setTimezone = useIdentifiedMutation(api.family.setChildTimezone)
  const setNightLockWindow = useIdentifiedMutation(
    api.family.setNightLockWindow,
  )
  const setLocked = useIdentifiedMutation(api.family.setAccountLocked)

  const [tz, setTz] = React.useState<string>(settings?.childTimezone ?? "")
  const [nightStart, setNightStart] = React.useState<string>(
    settings?.nightLockWindow?.start ?? "22:00",
  )
  const [nightEnd, setNightEnd] = React.useState<string>(
    settings?.nightLockWindow?.end ?? "06:00",
  )
  const [savingTz, setSavingTz] = React.useState(false)
  const [savingNightLock, setSavingNightLock] = React.useState(false)
  const [busyLock, setBusyLock] = React.useState(false)

  React.useEffect(() => {
    setTz(settings?.childTimezone ?? "")
    setNightStart(settings?.nightLockWindow?.start ?? "22:00")
    setNightEnd(settings?.nightLockWindow?.end ?? "06:00")
  }, [settings?.childTimezone, settings?.nightLockWindow])

  const ageBand: "under_12" | "12_plus" = settings?.ageBand ?? "12_plus"

  // Resolve every flag with default fallback so the toggle reflects the
  // *effective* value the policy uses today.
  function resolved(key: FlagKey): boolean {
    const stored = settings?.flags[key as keyof typeof settings.flags]
    if (typeof stored === "boolean") return stored
    return AGE_BAND_DEFAULTS[ageBand][key]
  }

  // Whether the value is explicitly stored vs. defaulted — used to surface a
  // "default" hint next to the toggle.
  function isDefaulted(key: FlagKey): boolean {
    const stored = settings?.flags[key as keyof typeof settings.flags]
    return typeof stored !== "boolean"
  }

  async function handleToggle(key: FlagKey, value: boolean) {
    try {
      await updateFlags({
        childId,
        flags: { [key]: value },
      })
      toast.success("Setting updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  async function handleSaveTimezone() {
    if (!tz.trim()) {
      toast.error("Enter an IANA timezone")
      return
    }
    setSavingTz(true)
    try {
      await setTimezone({ childId, timezone: tz.trim() })
      toast.success("Timezone saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSavingTz(false)
    }
  }

  async function handleSaveNightLock() {
    if (!/^\d{2}:\d{2}$/.test(nightStart) || !/^\d{2}:\d{2}$/.test(nightEnd)) {
      toast.error("Times must be HH:MM")
      return
    }
    setSavingNightLock(true)
    try {
      await setNightLockWindow({
        childId,
        start: nightStart,
        end: nightEnd,
      })
      toast.success("Night-lock window saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSavingNightLock(false)
    }
  }

  async function handleToggleLock() {
    const locked = settings?.flags.accountLocked === true
    const next = !locked
    if (
      next &&
      !confirm(
        "Lock this account? Your child will see a 'locked' interstitial until you unlock it.",
      )
    )
      return
    setBusyLock(true)
    try {
      await setLocked({ childId, locked: next })
      toast.success(next ? "Account locked" : "Account unlocked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusyLock(false)
    }
  }

  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Settings not available.
      </p>
    )
  }

  if (!canEdit) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Step-parents have read-only access. Ask the primary parent to change
        these settings.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {FLAG_SECTIONS.map((section) => (
        <div key={section.title} className="rounded-lg border bg-card p-4">
          <p className="text-sm font-semibold">{section.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {section.description}
          </p>
          <ul className="mt-3 divide-y">
            {section.flags.map(({ key, label, help }) => {
              const value = resolved(key)
              const defaulted = isDefaulted(key)
              return (
                <li
                  key={key}
                  className="flex items-start gap-3 py-3"
                >
                  <Switch
                    id={`flag-${key}`}
                    checked={value}
                    onCheckedChange={(checked) => handleToggle(key, checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor={`flag-${key}`}
                      className="text-sm font-medium"
                    >
                      {label}
                      {defaulted && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px]"
                        >
                          default
                        </Badge>
                      )}
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {help}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {/* Timezone */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Timezone</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          IANA timezone. Used by night lock and audit timestamps.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="America/New_York"
          />
          <Button onClick={handleSaveTimezone} disabled={savingTz}>
            Save
          </Button>
        </div>
      </div>

      {/* Night-lock window */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Night-lock window</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Quiet-hours window in your child&apos;s timezone. Only close-tier
          friends can chat during this window when night lock is enabled
          above.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="night-start" className="text-xs">
              Start
            </Label>
            <Input
              id="night-start"
              value={nightStart}
              onChange={(e) => setNightStart(e.target.value)}
              placeholder="22:00"
              className="mt-1 w-28"
            />
          </div>
          <div>
            <Label htmlFor="night-end" className="text-xs">
              End
            </Label>
            <Input
              id="night-end"
              value={nightEnd}
              onChange={(e) => setNightEnd(e.target.value)}
              placeholder="06:00"
              className="mt-1 w-28"
            />
          </div>
          <Button onClick={handleSaveNightLock} disabled={savingNightLock}>
            Save window
          </Button>
        </div>
      </div>

      {/* Lock account */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Account lock</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Primary-parent only. Locking the account shows your child a
          friendly &ldquo;locked&rdquo; interstitial until you unlock it.
        </p>
        <div className="mt-3">
          <Button
            variant={settings.flags.accountLocked ? "outline" : "destructive"}
            disabled={!isPrimary || busyLock}
            onClick={handleToggleLock}
          >
            {settings.flags.accountLocked ? (
              <>
                <UnlockIcon className="size-4" />
                Unlock account
              </>
            ) : (
              <>
                <LockIcon className="size-4" />
                Lock account
              </>
            )}
          </Button>
          {!isPrimary && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Only the primary parent can lock the account.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Approvals tab
// ─────────────────────────────────────────────────────────────────────────────

function ApprovalsTab({
  childId,
  canApprove,
}: {
  childId: Id<"users">
  canApprove: boolean
}) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const requests = useQuery(
    api.crossBandRequests.listPendingForChild,
    skip ? "skip" : { childId, ...identityArg },
  )
  const resolve = useIdentifiedMutation(api.crossBandRequests.resolveApproval)
  const [busy, setBusy] = React.useState<Id<"crossBandRequests"> | null>(null)

  async function handleResolve(
    requestId: Id<"crossBandRequests">,
    decision: "approved" | "denied",
  ) {
    setBusy(requestId)
    try {
      await resolve({ requestId, decision })
      toast.success(decision === "approved" ? "Approved" : "Denied")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  if (requests === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No pending approvals.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {requests.map(({ row, other }) => {
        const isBusy = busy === row._id
        return (
          <li
            key={row._id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {other?.name ?? "Unknown user"}
              </p>
              <p className="text-xs text-muted-foreground">
                Scope: <span className="font-medium">{row.scope}</span> ·{" "}
                {new Date(row.createdAt).toLocaleString()}
              </p>
              {row.reason && (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  &ldquo;{row.reason}&rdquo;
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!canApprove || isBusy}
                onClick={() => handleResolve(row._id, "approved")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canApprove || isBusy}
                onClick={() => handleResolve(row._id, "denied")}
              >
                Deny
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar tab
// ─────────────────────────────────────────────────────────────────────────────

function CalendarTab({ childId }: { childId: Id<"users"> }) {
  // listChildCalendar is a mutation (writes audit log). We invoke it on mount
  // and again on user-triggered refresh.
  const fetchCalendar = useIdentifiedMutation(api.spouse.listChildCalendar)
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "loaded"; allowed: boolean; events: Doc<"events">[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" })

  const load = React.useCallback(async () => {
    setState({ kind: "loading" })
    try {
      const res = await fetchCalendar({ childId })
      setState({ kind: "loaded", allowed: res.allowed, events: res.events })
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed",
      })
    }
  }, [fetchCalendar, childId])

  React.useEffect(() => {
    void load()
  }, [load])

  if (state.kind === "loading") {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        {state.message}
      </div>
    )
  }
  if (!state.allowed) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Calendar visibility is turned off in settings.
      </div>
    )
  }
  if (state.events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <CalendarIcon className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No events</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => void load()}
        >
          <RefreshCwIcon className="size-3.5" />
          Refresh
        </Button>
      </div>
    )
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="size-3.5" />
          Refresh
        </Button>
      </div>
      <ul className="space-y-2">
        {state.events.map((event) => (
          <li
            key={event._id}
            className="rounded-lg border bg-card p-3"
          >
            <p className="text-sm font-medium">{event.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {new Date(event.startsAt).toLocaleString()}
              {event.endsAt
                ? ` → ${new Date(event.endsAt).toLocaleString()}`
                : ""}
              {event.locationName ? ` · ${event.locationName}` : ""}
            </p>
            <Badge variant="outline" className="mt-1 text-[10px]">
              {event.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit tab
// ─────────────────────────────────────────────────────────────────────────────

function AuditTab({ childId }: { childId: Id<"users"> }) {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const rows = useQuery(
    api.family.listAuditLog,
    skip ? "skip" : { childId, limit: 200, ...identityArg },
  )

  if (rows === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No audit entries yet.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {rows.map(({ row, actor }) => (
        <li
          key={row._id}
          className="rounded-lg border bg-card p-3"
        >
          <p className="text-sm">
            <span className="font-medium">{actor?.name ?? "Unknown"}</span>{" "}
            <span className="text-muted-foreground">·</span>{" "}
            <span className="font-mono text-xs">{row.action}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {new Date(row.createdAt).toLocaleString()}
          </p>
          {row.meta && Object.keys(row.meta).length > 0 && (
            <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-[11px]">
              {JSON.stringify(row.meta, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardians tab
// ─────────────────────────────────────────────────────────────────────────────

function GuardiansTab({
  childId,
  guardians,
  isPrimary,
}: {
  childId: Id<"users">
  guardians: Array<{
    user: Doc<"users"> | null
    role: "primary" | "co_parent" | "step_parent"
    linkId: Id<"familyLinks">
  }>
  isPrimary: boolean
}) {
  const invite = useIdentifiedMutation(api.family.inviteCoParent)
  const setRole = useIdentifiedMutation(api.family.setGuardianRole)
  const revoke = useIdentifiedMutation(api.family.revokeGuardian)

  const [email, setEmail] = React.useState("")
  const [role, setRole2] = React.useState<"co_parent" | "step_parent">(
    "co_parent",
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [busy, setBusy] = React.useState<Id<"familyLinks"> | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      toast.error("Enter an email address")
      return
    }
    setSubmitting(true)
    try {
      const res = await invite({
        childId,
        targetEmail: email.trim(),
        role,
      })
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

  async function handleSetRole(
    linkId: Id<"familyLinks">,
    nextRole: "co_parent" | "step_parent",
  ) {
    setBusy(linkId)
    try {
      await setRole({ linkId, role: nextRole })
      toast.success("Role updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleRevoke(linkId: Id<"familyLinks">, name: string) {
    if (!confirm(`Remove ${name} as a guardian?`)) return
    setBusy(linkId)
    try {
      await revoke({ linkId })
      toast.success("Guardian removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {isPrimary && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-semibold">Invite a guardian</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Co-parents have full settings access. Step-parents have read-only
            metadata access.
          </p>
          <form
            onSubmit={handleInvite}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <div className="flex-1 min-w-[12rem]">
              <Label htmlFor="guardian-email" className="text-xs">
                Email
              </Label>
              <Input
                id="guardian-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adult@example.com"
                className="mt-1"
              />
            </div>
            <div className="w-44">
              <Label className="text-xs">Role</Label>
              <Select
                value={role}
                onValueChange={(v) =>
                  setRole2(v as "co_parent" | "step_parent")
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="co_parent">Co-parent</SelectItem>
                  <SelectItem value="step_parent">Step-parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={submitting}>
              <UserPlusIcon className="size-4" />
              Invite
            </Button>
          </form>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <p className="text-sm font-semibold">Active guardians</p>
        </div>
        <ul className="divide-y">
          {guardians.map((g) => {
            const isBusy = busy === g.linkId
            const canModify = isPrimary && g.role !== "primary"
            return (
              <li
                key={g.linkId}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-semibold text-white">
                  {initials(g.user?.name ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {g.user?.name ?? "Unknown"}
                  </p>
                  {g.user?.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {g.user.email}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {g.role}
                </Badge>
                {canModify && (
                  <div className="flex gap-2">
                    {g.role === "step_parent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => handleSetRole(g.linkId, "co_parent")}
                      >
                        <KeyRoundIcon className="size-3.5" />
                        Promote
                      </Button>
                    )}
                    {g.role === "co_parent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => handleSetRole(g.linkId, "step_parent")}
                      >
                        Demote
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() =>
                        handleRevoke(g.linkId, g.user?.name ?? "this person")
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
