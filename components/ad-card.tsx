"use client"

import * as React from "react"
import { ExternalLinkIcon, TagIcon } from "lucide-react"

import type { Doc } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AdCardProps = {
  ad: Doc<"ads">
  // Optional handlers wired from the host page. Tracking is not plumbed in
  // this PR — PR #8 will wrap these to emit impression / click events.
  onCtaClick?: () => void
  onSaveCoupon?: () => void
  // "community" renders the ad the way a community viewer would see it
  // (clean, CTA-forward). "business" is for the owner's preview — same
  // shape but we show the status pill + muted affordance around coupon.
  context?: "community" | "business"
  className?: string
  statusBadge?: React.ReactNode
}

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

// Shared ad rendering. Attempts to show an image, falls back to a gradient
// header so a caption-only ad still has visual weight. Caption is clamped
// to 3 lines via Tailwind's `line-clamp-3`. CTA / coupon buttons are kept
// stylistically prominent because community viewers will tap them most.
export function AdCard({
  ad,
  onCtaClick,
  onSaveCoupon,
  context = "community",
  className,
  statusBadge,
}: AdCardProps) {
  const showStatusBadge =
    context === "business" &&
    (statusBadge ?? (
      <Badge variant={statusTone(ad.status)} className="text-[10px]">
        {ad.status}
      </Badge>
    ))

  const hasMedia = !!ad.imageUrl || !!ad.videoUrl
  const hasCta = !!ad.ctaLabel && !!ad.ctaUrl

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card transition-colors",
        className,
      )}
    >
      {ad.videoUrl ? (
        // `preload="metadata"` keeps the initial network cheap; the viewer
        // can decide to actually play.
        <video
          controls
          preload="metadata"
          poster={ad.imageUrl}
          className="h-48 w-full object-cover bg-muted"
        >
          <source src={ad.videoUrl} />
        </video>
      ) : ad.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.imageUrl}
          alt=""
          className="h-48 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-24 w-full bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-500" />
      )}

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{ad.title}</h3>
            {ad.subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {ad.subtitle}
              </p>
            )}
          </div>
          {showStatusBadge}
        </div>

        <p
          className={cn(
            "mt-2 text-sm text-muted-foreground whitespace-pre-wrap",
            // Three-line clamp keeps community feed items a stable height.
            "line-clamp-3",
          )}
        >
          {ad.caption}
        </p>

        {(hasCta || ad.couponCode) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {hasCta && (
              <Button
                size="sm"
                onClick={() => {
                  onCtaClick?.()
                  if (ad.ctaUrl) {
                    window.open(ad.ctaUrl, "_blank", "noopener,noreferrer")
                  }
                }}
                // When a host doesn't wire a handler in "business" preview
                // we still allow opening, but the button doesn't visually
                // pretend to be a live CTA.
                variant={context === "business" ? "outline" : "default"}
              >
                {ad.ctaLabel}
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            )}
            {ad.couponCode && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSaveCoupon?.()}
                disabled={!onSaveCoupon && context === "business"}
                // Coupons don't need an href — they're intended to be
                // saved into a wallet/pasted at checkout. PR #8 wires this
                // to a couponSaves event.
              >
                <TagIcon className="size-3.5" />
                {ad.couponCode}
              </Button>
            )}
          </div>
        )}

        {!hasMedia && context === "business" && (
          <p className="mt-3 text-xs text-muted-foreground">
            No media. Add an image or video to improve visibility.
          </p>
        )}
      </div>
    </div>
  )
}
