"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import {
  BarChart3Icon,
  Building2Icon,
  ChevronRightIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PlusIcon,
  SparklesIcon,
  TicketIcon,
  UsersRoundIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { useAccountType } from "@/hooks/use-account-type"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// /dashboard/business — the single landing surface for business accounts.
//
// Business accounts land here instead of /dashboard/homie (which is still
// wired as the default redirect for personal accounts). It's a tile-based
// summary of every business-workspace surface:
//   Outreach (Homie AI) · Your Business · Team Chat · Ads · Community Reach
//   · Analytics.
//
// Personal accounts that somehow navigate here (wrong afterSignUpUrl, deep
// link, bookmark) are bounced to /dashboard/homie — we intentionally avoid
// server-side redirect so we don't have to duplicate the dev-mode identity
// plumbing; a client-side useEffect redirect is sufficient for a soft-guard.
export default function Page() {
  const router = useRouter()
  const activeUser = useActiveUser()
  const { accountType, isLoaded: accountTypeLoaded } = useAccountType()

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  // Always query the caller's primary owned business — this page's hero
  // lives or dies on whether one exists.
  const primaryBusiness = useQuery(
    api.businesses.getMyPrimaryBusiness,
    skip ? "skip" : identityArg,
  )
  const businessId = primaryBusiness?._id ?? null

  // Secondary queries are gated on having a primary business AND being a
  // member. listChannels / listMembers throw for non-members, so we have to
  // confirm membership via getBusinessForViewer first (which returns myRole
  // for free) before kicking them off.
  const viewerData = useQuery(
    api.businesses.getBusinessForViewer,
    skip || !businessId
      ? "skip"
      : { businessId, ...identityArg },
  )
  const isMemberConfirmed =
    viewerData !== undefined &&
    viewerData !== null &&
    viewerData.myRole !== null

  const channels = useQuery(
    api.orgChannels.listChannels,
    skip || !businessId || !isMemberConfirmed
      ? "skip"
      : { businessId, ...identityArg },
  )
  const members = useQuery(
    api.businessMembers.listMembers,
    skip || !businessId || !isMemberConfirmed
      ? "skip"
      : { businessId, ...identityArg },
  )
  const ads = useQuery(
    api.ads.listAdsForBusiness,
    skip || !businessId || !isMemberConfirmed
      ? "skip"
      : { businessId, ...identityArg },
  )

  // Personal-account soft-guard. We don't block the render — rendering the
  // skeleton for one frame and then bouncing is cheaper than waiting on a
  // full-page loading shell before doing the redirect.
  React.useEffect(() => {
    if (accountTypeLoaded && accountType === "personal") {
      router.replace("/dashboard/homie")
    }
  }, [accountTypeLoaded, accountType, router])

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Business Workspace" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="business workspace" />
        </div>
      </PageShell>
    )
  }

  // While we're resolving the account type (Clerk → Convex hop in prod), show
  // a skeleton grid instead of an empty frame. Keeps layout stable so the
  // tiles don't pop in once the redirect-or-render decision is made.
  if (!accountTypeLoaded || primaryBusiness === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Business Workspace" />}>
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  // No primary business yet — show a single prominent CTA to finish setup
  // instead of the tile grid (most tiles would be degenerate without an id).
  if (primaryBusiness === null) {
    return (
      <PageShell header={<SiteHeader pageName="Business Workspace" />}>
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
            <div className="rounded-lg border border-dashed bg-card p-8 text-center">
              <Building2Icon className="mx-auto size-10 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold">
                Complete your business setup
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your business to unlock the workspace — org chat, ads,
                analytics, and Homie&apos;s growth AI all tailored to your
                business.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/dashboard/businesses/new">
                  <PlusIcon className="size-4" />
                  Create business
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  const activeAds = (ads ?? []).filter(
    (a) => a.status === "approved" || a.status === "running",
  )
  const channelCount = channels?.length ?? 0
  const memberCount = members?.members.length ?? 0

  return (
    <PageShell header={<SiteHeader pageName="Business Workspace" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                {primaryBusiness.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Your business workspace — outreach, team, ads, and analytics
                in one place.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/businesses/${primaryBusiness._id}`}>
                View business page
                <ChevronRightIcon className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              href="/dashboard/homie"
              icon={<SparklesIcon className="size-5" />}
              title="Outreach"
              subtitle="Ask Homie about growth"
              description="Your AI growth partner — drafts ad copy, finds communities that fit, and suggests local partnerships."
              accent="from-fuchsia-500 via-violet-500 to-indigo-500"
            />

            <Tile
              href="/dashboard/profile"
              icon={<Building2Icon className="size-5" />}
              title="Your Business"
              subtitle={primaryBusiness.category}
              description={
                primaryBusiness.tagline ||
                primaryBusiness.description ||
                "Edit your business profile, contact info, and hours."
              }
              leading={
                primaryBusiness.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primaryBusiness.logoUrl}
                    alt=""
                    className="size-10 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-md border bg-gradient-to-br from-indigo-400 to-purple-600 text-xs font-semibold text-white">
                    {initials(primaryBusiness.name)}
                  </div>
                )
              }
              meta={
                primaryBusiness.verified ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Verified
                  </Badge>
                ) : null
              }
            />

            <Tile
              href={`/dashboard/businesses/${primaryBusiness._id}/chat`}
              icon={<MessageSquareIcon className="size-5" />}
              title="Team Chat"
              subtitle={
                isMemberConfirmed
                  ? `${channelCount} channel${channelCount === 1 ? "" : "s"} · ${memberCount} member${memberCount === 1 ? "" : "s"}`
                  : "Loading…"
              }
              description="Coordinate with your managers and employees across org channels."
              accent="from-sky-500 via-cyan-500 to-teal-500"
            />

            <Tile
              href={`/dashboard/businesses/${primaryBusiness._id}/ads`}
              icon={<MegaphoneIcon className="size-5" />}
              title="Ads"
              subtitle={
                isMemberConfirmed
                  ? `${activeAds.length} running`
                  : "Loading…"
              }
              description="Create, submit, and track ads with optional coupons attached."
              accent="from-amber-500 via-orange-500 to-red-500"
            />

            <Tile
              href="/dashboard/communities"
              icon={<UsersRoundIcon className="size-5" />}
              title="Community Reach"
              subtitle="Find matching audiences"
              description="Find communities that match your audience. Discover the circles your potential customers already hang out in."
              accent="from-emerald-500 via-lime-500 to-yellow-500"
            />

            <Tile
              href={`/dashboard/businesses/${primaryBusiness._id}/analytics`}
              icon={<BarChart3Icon className="size-5" />}
              title="Analytics"
              subtitle="Impressions · clicks · coupons"
              description="See how your ads and coupons are performing across communities and time."
              accent="from-rose-500 via-pink-500 to-fuchsia-500"
            />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

// Single tile card. Two visual variants:
//   - `accent` gradient rail on the left (default for action-ish tiles).
//   - `leading` custom slot for tiles that want a logo / avatar thumbnail
//     (used by "Your Business"). When `leading` is supplied it wins; accent
//     is ignored.
function Tile({
  href,
  icon,
  title,
  subtitle,
  description,
  accent,
  leading,
  meta,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle?: string
  description?: string
  accent?: string
  leading?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-lg border bg-card transition-colors hover:bg-muted/40"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          {leading ? (
            leading
          ) : (
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${
                accent ?? "from-slate-400 to-slate-600"
              } text-white`}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium">{title}</h3>
              {meta}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        {description && (
          <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </Link>
  )
}
