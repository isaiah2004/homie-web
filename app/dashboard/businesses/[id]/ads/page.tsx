"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { ArrowLeftIcon, MegaphoneIcon, PlusIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function statusTone(
  status: Doc<"ads">["status"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
    case "running":
      return "default"
    case "submitted":
      return "secondary"
    case "rejected":
      return "destructive"
    case "draft":
    case "ended":
      return "outline"
  }
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
  const ads = useQuery(
    api.ads.listAdsForBusiness,
    skip ? "skip" : { businessId, ...identityArg },
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Ads" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="businesses" />
        </div>
      </PageShell>
    )
  }

  if (viewerData === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Ads" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  // Gate before waiting on `listAdsForBusiness` — that query throws for
  // non-members so a stuck Loading state would be misleading.
  if (viewerData === null || viewerData.myRole === null) {
    return (
      <PageShell header={<SiteHeader pageName="Ads" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Not allowed</h2>
              <Button asChild className="mt-4">
                <Link href="/dashboard/businesses">Back to businesses</Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (ads === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Ads" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  const canCreateAds =
    viewerData.myRole === "owner" ||
    viewerData.myRole === "admin" ||
    viewerData.myRole === "manager"

  return (
    <PageShell header={<SiteHeader pageName="Ads" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-4xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                Ads for {viewerData.business.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Draft, submit, and track your advertising campaigns.
              </p>
            </div>
            {canCreateAds && (
              <Button asChild>
                <Link href={`/dashboard/businesses/${businessId}/ads/new`}>
                  <PlusIcon className="size-4" />
                  New Ad
                </Link>
              </Button>
            )}
          </div>

          {ads.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <MegaphoneIcon className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No ads yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Managers and above can create ad drafts.
              </p>
              {canCreateAds && (
                <Button className="mt-3" size="sm" asChild>
                  <Link href={`/dashboard/businesses/${businessId}/ads/new`}>
                    <PlusIcon className="size-3.5" />
                    Create ad
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {ads.map((ad) => (
                <Link
                  key={ad._id}
                  href={`/dashboard/businesses/${businessId}/ads/${ad._id}`}
                  className="group block overflow-hidden rounded-lg border bg-card transition-colors hover:bg-muted/40"
                >
                  {ad.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ad.imageUrl}
                      alt=""
                      className="h-32 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-full bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-500" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">
                        {ad.title}
                      </h3>
                      <Badge
                        variant={statusTone(ad.status)}
                        className="text-[10px] shrink-0"
                      >
                        {ad.status}
                      </Badge>
                    </div>
                    {ad.subtitle && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {ad.subtitle}
                      </p>
                    )}
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {ad.caption}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
