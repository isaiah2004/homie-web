"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  SendIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { AdCard } from "@/components/ad-card"

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

export default function Page() {
  const activeUser = useActiveUser()
  const params = useParams<{ id: string; adId: string }>()
  const businessId = params.id as Id<"businesses">
  const adId = params.adId as Id<"ads">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const data = useQuery(
    api.ads.getAdForBusiness,
    skip ? "skip" : { adId, ...identityArg },
  )

  const submitForApproval = useIdentifiedMutation(api.ads.submitForApproval)
  const approveAd = useIdentifiedMutation(api.ads.approveAd)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Ad" />
        <PickDevUserEmptyState pageName="businesses" />
      </div>
    )
  }

  if (data === undefined) {
    return (
      <div>
        <SiteHeader pageName="Ad" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div>
        <SiteHeader pageName="Ad" />
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Ad unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This ad doesn&apos;t exist or you don&apos;t have access.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/dashboard/businesses/${businessId}/ads`}>
                Back to ads
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { ad, myRole } = data
  const canSubmit =
    (myRole === "owner" || myRole === "admin" || myRole === "manager") &&
    ad.status === "draft"

  async function handleSubmit() {
    try {
      await submitForApproval({ adId })
      toast.success("Submitted for approval")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit")
    }
  }

  async function handleApprove() {
    try {
      await approveAd({ adId })
      toast.success("Ad approved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve")
    }
  }

  return (
    <div>
      <SiteHeader pageName="Ad" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}/ads`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Preview
              </h2>
              <AdCard ad={ad} context="business" />
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold">Status</h3>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{ad.status}</Badge>
                </div>
                <Separator className="my-3" />

                <div className="flex flex-col gap-2">
                  {canSubmit && (
                    <Button size="sm" onClick={handleSubmit}>
                      <SendIcon className="size-4" />
                      Submit for approval
                    </Button>
                  )}
                  {isDevMode && ad.status === "submitted" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApprove}
                    >
                      <ShieldCheckIcon className="size-4" />
                      Approve (dev)
                    </Button>
                  )}
                  {ad.status === "approved" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2Icon className="size-3.5 text-green-600" />
                      Approved — visible in communities once PR #7 ships
                      ad placements.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold">Analytics</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Impressions, clicks, and coupon usage will appear here
                  once tracking ships in PR #8.
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold">Metadata</h3>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {ad.budgetPerWeek !== undefined && (
                    <div className="flex items-center justify-between gap-2">
                      <dt>Weekly budget</dt>
                      <dd className="font-medium text-foreground">
                        {ad.budgetPerWeek}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <dt>Created</dt>
                    <dd className="font-medium text-foreground">
                      {new Date(ad.createdAt).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
