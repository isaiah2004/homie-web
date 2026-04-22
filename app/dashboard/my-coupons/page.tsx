"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, TagIcon, TicketIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
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

  const rows = useQuery(
    api.communityAds.listSavedCoupons,
    skip ? "skip" : identityArg,
  )

  const markUsed = useIdentifiedMutation(api.communityAds.markCouponUsed)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="My Coupons" />
        <PickDevUserEmptyState pageName="your coupons" />
      </div>
    )
  }

  return (
    <div>
      <SiteHeader pageName="My Coupons" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <TicketIcon className="size-5" />
            <h1 className="text-lg font-semibold">My Coupons</h1>
          </div>

          {rows === undefined ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-10 text-center">
              <TagIcon className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No saved coupons yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Save one from a community ad.
              </p>
              <Button asChild className="mt-4" size="sm" variant="outline">
                <Link href="/dashboard/communities">Browse communities</Link>
              </Button>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map((row) => (
                <CouponRow
                  key={row.saved._id}
                  savedCouponId={row.saved._id}
                  couponCode={row.saved.couponCode}
                  usedAt={row.saved.usedAt}
                  savedAt={row.saved.savedAt}
                  title={row.ad.title}
                  businessName={row.business?.name ?? "Unknown business"}
                  onMarkUsed={async () => {
                    try {
                      await markUsed({ savedCouponId: row.saved._id })
                      toast.success("Marked as used")
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Failed",
                      )
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function CouponRow({
  couponCode,
  usedAt,
  savedAt,
  title,
  businessName,
  onMarkUsed,
}: {
  savedCouponId: Id<"savedCoupons">
  couponCode: string
  usedAt?: number
  savedAt: number
  title: string
  businessName: string
  onMarkUsed: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(couponCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Ignore — code is visible inline anyway.
    }
  }

  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {businessName}
          </p>
        </div>
        {usedAt !== undefined && (
          <Badge variant="outline" className="text-[10px]">
            Used
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed bg-muted/30 p-2">
        <code className="truncate text-xs font-mono font-semibold">
          {couponCode}
        </code>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          title="Copy coupon code"
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          Saved {formatDate(savedAt)}
        </p>
        {usedAt === undefined && (
          <Button size="sm" variant="outline" onClick={onMarkUsed}>
            Mark used
          </Button>
        )}
      </div>
    </li>
  )
}
