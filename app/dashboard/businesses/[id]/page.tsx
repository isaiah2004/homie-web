"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import {
  ArrowLeftIcon,
  BarChart3Icon,
  ExternalLinkIcon,
  MapPinIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

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

  // Members + ads are gated on business membership on the backend. We
  // only kick those queries off once `viewerData` confirms we're a
  // member — otherwise they'd throw and dead-end the render.
  const isMemberConfirmed =
    viewerData !== undefined &&
    viewerData !== null &&
    viewerData.myRole !== null
  const members = useQuery(
    api.businessMembers.listMembers,
    skip || !isMemberConfirmed
      ? "skip"
      : { businessId, ...identityArg },
  )
  const ads = useQuery(
    api.ads.listAdsForBusiness,
    skip || !isMemberConfirmed
      ? "skip"
      : { businessId, ...identityArg },
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Business" />
        <PickDevUserEmptyState pageName="businesses" />
      </div>
    )
  }

  if (viewerData === undefined) {
    return (
      <div>
        <SiteHeader pageName="Business" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (viewerData === null) {
    return (
      <div>
        <SiteHeader pageName="Business" />
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Business not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This business doesn&apos;t exist or was removed.
            </p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/businesses">Back to businesses</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { business, myRole } = viewerData
  const isMember = myRole !== null
  const memberCount = members?.members.length ?? 0
  const activeAds = (ads ?? []).filter(
    (a) => a.status === "approved" || a.status === "running",
  )

  return (
    <div>
      <SiteHeader pageName="Business" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-4xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/businesses">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="overflow-hidden rounded-lg border bg-card">
            {business.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.coverImageUrl}
                alt=""
                className="h-48 w-full object-cover"
              />
            ) : (
              <div className="h-32 w-full bg-gradient-to-br from-slate-400 via-indigo-500 to-fuchsia-500" />
            )}
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  {business.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={business.logoUrl}
                      alt=""
                      className="size-16 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-md border bg-gradient-to-br from-indigo-400 to-purple-600 text-sm font-semibold text-white">
                      {initials(business.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-2xl font-semibold">
                        {business.name}
                      </h1>
                      {business.verified && (
                        <Badge variant="secondary" className="text-[10px]">
                          Verified
                        </Badge>
                      )}
                      {business.isPaid && (
                        <Badge variant="default" className="text-[10px]">
                          Paid
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {business.category}
                      </Badge>
                      {myRole && (
                        <Badge variant="secondary" className="text-[10px]">
                          You are {myRole}
                        </Badge>
                      )}
                    </div>
                    {business.website && (
                      <a
                        href={business.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {business.website}
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    )}
                    {business.locationAddress && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPinIcon className="size-3 shrink-0" />
                        <span className="truncate">
                          {business.locationAddress}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {business.description && (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm whitespace-pre-wrap">
                    {business.description}
                  </p>
                </>
              )}

              {isMember && (
                <>
                  <Separator className="my-4" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                      icon={<UsersIcon className="size-4" />}
                      label="Members"
                      value={memberCount}
                    />
                    <StatCard
                      icon={<MegaphoneIcon className="size-4" />}
                      label="Active ads"
                      value={activeAds.length}
                    />
                    <StatCard
                      icon={<BarChart3Icon className="size-4" />}
                      label="7-day impressions"
                      value={"—"}
                      hint="Wired in PR #8"
                    />
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <LinkPanel
                      href={`/dashboard/businesses/${business._id}/members`}
                      icon={<UsersIcon className="size-4" />}
                      label="Members"
                    />
                    <LinkPanel
                      href={`/dashboard/businesses/${business._id}/ads`}
                      icon={<MegaphoneIcon className="size-4" />}
                      label="Ads"
                    />
                    <LinkPanel
                      href={`/dashboard/businesses/${business._id}/chat`}
                      icon={<MessageSquareIcon className="size-4" />}
                      label="Org chat"
                    />
                    <LinkPanel
                      href={`/dashboard/businesses/${business._id}/analytics`}
                      icon={<BarChart3Icon className="size-4" />}
                      label="Analytics"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function LinkPanel({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border bg-background p-3 text-sm transition-colors hover:bg-muted/40"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  )
}
