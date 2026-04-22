"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowLeftIcon, BarChart3Icon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const chartConfig = {
  impressions: { label: "Impressions", color: "var(--chart-1)" },
  clicks: { label: "Clicks", color: "var(--chart-2)" },
  saves: { label: "Coupon saves", color: "var(--chart-3)" },
} satisfies ChartConfig

function formatShortDate(d: string) {
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
  const params = useParams<{ id: string }>()
  const businessId = params.id as Id<"businesses">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const summary = useQuery(
    api.adMetrics.getBusinessAnalyticsSummary,
    skip ? "skip" : { businessId, days: 30, ...identityArg },
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Analytics" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="businesses" />
        </div>
      </PageShell>
    )
  }

  if (summary === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Analytics" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  const hasAnyData =
    summary.totalImpressions > 0 ||
    summary.totalClicks > 0 ||
    summary.totalSaves > 0 ||
    summary.totalUses > 0 ||
    summary.perAd.length > 0

  return (
    <PageShell header={<SiteHeader pageName="Analytics" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          {!hasAnyData ? (
            <div className="rounded-lg border border-dashed bg-card p-10 text-center">
              <BarChart3Icon className="mx-auto size-10 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold">
                No data yet
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Impressions, clicks, and coupon events land here once
                your ads start appearing in communities.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <SummaryCard
                  label="Impressions"
                  value={summary.totalImpressions.toLocaleString()}
                />
                <SummaryCard
                  label="Clicks"
                  value={summary.totalClicks.toLocaleString()}
                  hint={`CTR ${formatCtr(summary.overallCtr)}`}
                />
                <SummaryCard
                  label="Coupon saves"
                  value={summary.totalSaves.toLocaleString()}
                />
                <SummaryCard
                  label="Coupon uses"
                  value={summary.totalUses.toLocaleString()}
                />
              </div>

              <div className="mt-4 rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    All ads · last 30 days
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Stacked
                  </span>
                </div>
                <Separator className="my-3" />
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto h-[260px] w-full"
                >
                  <AreaChart data={summary.timeSeries}>
                    <defs>
                      <linearGradient
                        id="fillImpressions"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-impressions)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-impressions)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                      <linearGradient
                        id="fillClicks"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-clicks)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-clicks)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                      <linearGradient
                        id="fillSaves"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-saves)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-saves)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
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
                    <Area
                      dataKey="saves"
                      type="monotone"
                      fill="url(#fillSaves)"
                      stroke="var(--color-saves)"
                      stackId="a"
                    />
                    <Area
                      dataKey="clicks"
                      type="monotone"
                      fill="url(#fillClicks)"
                      stroke="var(--color-clicks)"
                      stackId="a"
                    />
                    <Area
                      dataKey="impressions"
                      type="monotone"
                      fill="url(#fillImpressions)"
                      stroke="var(--color-impressions)"
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              </div>

              <div className="mt-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between p-4">
                  <h3 className="text-sm font-semibold">Per-ad breakdown</h3>
                  <span className="text-[10px] text-muted-foreground">
                    Sorted by impressions (30d)
                  </span>
                </div>
                {summary.perAd.length === 0 ? (
                  <p className="px-4 pb-4 text-xs text-muted-foreground">
                    No ads yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ad</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          Impressions (7d)
                        </TableHead>
                        <TableHead className="text-right">
                          Impressions (30d)
                        </TableHead>
                        <TableHead className="text-right">
                          Clicks
                        </TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">
                          Coupon saves
                        </TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.perAd.map((row) => (
                        <TableRow key={row.adId}>
                          <TableCell className="font-medium">
                            <span className="block max-w-[220px] truncate">
                              {row.title}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.impressions7d.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.impressions.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.clicks.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCtr(row.ctr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.saves.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                            >
                              <Link
                                href={`/dashboard/businesses/${businessId}/ads/${row.adId}`}
                              >
                                View full
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
