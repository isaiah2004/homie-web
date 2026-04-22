"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
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
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Separator } from "@/components/ui/separator"
import { AdCard } from "@/components/ad-card"

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

const chartConfig = {
  impressions: { label: "Impressions", color: "var(--chart-1)" },
  clicks: { label: "Clicks", color: "var(--chart-2)" },
  couponSaves: { label: "Coupon saves", color: "var(--chart-3)" },
} satisfies ChartConfig

function formatShortDate(d: string) {
  // Dates come from the backend in `YYYY-MM-DD` UTC form; parse as UTC
  // so the tick label lines up with the bucket rather than drifting by
  // the viewer's timezone offset.
  const [y, m, day] = d.split("-").map(Number)
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1))
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function formatCtr(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

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

  // Analytics — manager+ gated server-side. Roles below manager will get
  // an error from the backend; rendering below guards on `data.myRole`.
  const canViewAnalytics =
    data != null &&
    data.myRole !== "employee"
  const analytics = useQuery(
    api.adMetrics.getAdAnalytics,
    skip || !canViewAnalytics
      ? "skip"
      : { adId, days: 30, ...identityArg },
  )

  const submitForApproval = useIdentifiedMutation(api.ads.submitForApproval)
  const approveAd = useIdentifiedMutation(api.ads.approveAd)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Ad" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="businesses" />
        </div>
      </PageShell>
    )
  }

  if (data === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Ad" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  if (data === null) {
    return (
      <PageShell header={<SiteHeader pageName="Ad" />}>
        <div className="flex-1 overflow-auto">
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
      </PageShell>
    )
  }

  const { ad, myRole } = data
  const canSubmit =
    (myRole === "owner" || myRole === "admin" || myRole === "manager") &&
    ad.status === "draft"

  // Top-of-page totals across the entire 30d window.
  const totals = (analytics ?? []).reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      couponSaves: acc.couponSaves + row.couponSaves,
      couponUses: acc.couponUses + row.couponUses,
    }),
    { impressions: 0, clicks: 0, couponSaves: 0, couponUses: 0 },
  )
  const overallCtr =
    totals.impressions > 0 ? totals.clicks / totals.impressions : 0

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
    <PageShell header={<SiteHeader pageName="Ad" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}/ads`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  Preview
                </h2>
                <AdCard ad={ad} context="business" />
              </div>

              {canViewAnalytics && (
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Analytics</h3>
                    <span className="text-[10px] text-muted-foreground">
                      Last 30 days
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <MiniStat
                      label="Impressions"
                      value={totals.impressions.toLocaleString()}
                    />
                    <MiniStat
                      label="Clicks"
                      value={totals.clicks.toLocaleString()}
                    />
                    <MiniStat label="CTR" value={formatCtr(overallCtr)} />
                    <MiniStat
                      label="Coupon saves"
                      value={totals.couponSaves.toLocaleString()}
                    />
                    <MiniStat
                      label="Coupon uses"
                      value={totals.couponUses.toLocaleString()}
                    />
                  </div>

                  <Separator className="my-4" />

                  {analytics === undefined ? (
                    <p className="text-xs text-muted-foreground">
                      Loading chart…
                    </p>
                  ) : analytics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No metrics recorded yet.
                    </p>
                  ) : (
                    <ChartContainer
                      config={chartConfig}
                      className="aspect-auto h-[260px] w-full"
                    >
                      <LineChart data={analytics}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          minTickGap={24}
                          tickFormatter={formatShortDate}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          width={32}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              labelFormatter={(value) =>
                                formatShortDate(String(value))
                              }
                              indicator="dot"
                            />
                          }
                        />
                        <Line
                          dataKey="impressions"
                          type="monotone"
                          stroke="var(--color-impressions)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          dataKey="clicks"
                          type="monotone"
                          stroke="var(--color-clicks)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          dataKey="couponSaves"
                          type="monotone"
                          stroke="var(--color-couponSaves)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </div>
              )}
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
                      Approved — placed weekly into communities by the ad
                      rotation cron.
                    </div>
                  )}
                </div>
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
    </PageShell>
  )
}

function MiniStat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
