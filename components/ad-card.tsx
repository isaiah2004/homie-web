"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, ExternalLinkIcon, TagIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { cn } from "@/lib/utils"

export type AdCardProps = {
  ad: Doc<"ads">
  // Optional CTA-click hook. Firing order: `onCtaClick` runs, then the
  // impression/click metric is recorded, then the external URL opens.
  onCtaClick?: () => void
  // Fired when the viewer taps "Save coupon". Host should persist via
  // `api.communityAds.saveCoupon`. Ignored when `ad.couponCode` is unset.
  onSaveCoupon?: () => void
  // Viewer has already saved this coupon. When true the button switches
  // to a "Saved — copy" affordance backed by `onCopyCoupon`.
  isCouponSaved?: boolean
  // "community" renders the ad the way a community viewer would see it
  // (clean, CTA-forward). "business" is for the owner's preview — same
  // shape but we show the status pill + muted affordance around coupon.
  // Impression tracking only fires in "community" context so the owner
  // previewing their own ad doesn't inflate their metrics.
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

const IMPRESSION_DEDUPE_MS = 60 * 60 * 1000 // 1 hour per ad per session

// Shared ad rendering. Attempts to show an image, falls back to a gradient
// header so a caption-only ad still has visual weight. Caption is clamped
// to 3 lines via Tailwind's `line-clamp-3`. CTA / coupon buttons are kept
// stylistically prominent because community viewers will tap them most.
//
// Tracking:
//   - Impression: IntersectionObserver fires once per card per session
//     when the card enters the viewport. Dedupe uses sessionStorage
//     keyed by ad id (1h window) so a viewer scrolling past the same
//     ad repeatedly doesn't inflate counts. Only fires in "community"
//     context so the business-preview page doesn't self-inflate.
//   - Click: recorded whenever the CTA button is pressed, regardless of
//     whether the URL actually opens (user may cancel the pop-up).
export function AdCard({
  ad,
  onCtaClick,
  onSaveCoupon,
  isCouponSaved,
  context = "community",
  className,
  statusBadge,
}: AdCardProps) {
  const [copied, setCopied] = React.useState(false)
  const cardRef = React.useRef<HTMLDivElement | null>(null)

  // Both telemetry mutations are optional at call-time — if the dev has
  // disabled the metrics API (e.g. future feature flag) we simply drop
  // the signal rather than throw.
  const recordImpression = useIdentifiedMutation(
    api.adMetrics.recordImpression,
  )
  const recordClick = useIdentifiedMutation(api.adMetrics.recordClick)

  // IntersectionObserver for impression tracking. Re-runs when the ad
  // id changes so each card in a feed observes independently.
  React.useEffect(() => {
    if (context !== "community") return
    if (typeof window === "undefined") return
    const node = cardRef.current
    if (!node) return
    // SSR / older browser fallback: skip tracking rather than crash.
    if (typeof IntersectionObserver === "undefined") return

    const adId = ad._id

    let fired = false
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (fired) return
          fired = true
          try {
            const key = `ad-imp-${adId}`
            const last = Number(
              window.sessionStorage.getItem(key) ?? 0,
            )
            if (Date.now() - last < IMPRESSION_DEDUPE_MS) {
              observer.disconnect()
              return
            }
            window.sessionStorage.setItem(key, String(Date.now()))
          } catch {
            // sessionStorage can throw in private mode on some browsers;
            // fall through and still record the impression.
          }
          // Fire-and-forget — swallow rejection so a telemetry error
          // never surfaces in the viewer's UI.
          void recordImpression({ adId }).catch(() => {})
          observer.disconnect()
          return
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(node)
    return () => observer.disconnect()
    // `recordImpression` identity changes each render but we intentionally
    // keep the effect keyed only on ad id / context so we don't re-observe
    // on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad._id, context])

  const showStatusBadge =
    context === "business" &&
    (statusBadge ?? (
      <Badge variant={statusTone(ad.status)} className="text-[10px]">
        {ad.status}
      </Badge>
    ))

  const hasMedia = !!ad.imageUrl || !!ad.videoUrl
  const hasCta = !!ad.ctaLabel && !!ad.ctaUrl

  async function copyCoupon() {
    if (!ad.couponCode) return
    try {
      await navigator.clipboard.writeText(ad.couponCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API failures are non-fatal; the code stays visible inline.
    }
  }

  function handleCtaClick() {
    onCtaClick?.()
    if (context === "community") {
      void recordClick({ adId: ad._id }).catch(() => {})
    }
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <div
      ref={cardRef}
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
                onClick={handleCtaClick}
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
              isCouponSaved ? (
                // Viewer has saved this coupon — show the code + a copy
                // affordance. The button is clickable but never fires
                // onSaveCoupon again.
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={copyCoupon}
                  title="Copy coupon code"
                >
                  {copied ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  {copied ? "Copied" : ad.couponCode}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSaveCoupon?.()}
                  disabled={!onSaveCoupon && context === "business"}
                  // Save path records its couponSaves counter from the
                  // server-side mutation (see communityAds.saveCoupon) so
                  // we don't double-count by firing from the client too.
                >
                  <TagIcon className="size-3.5" />
                  {onSaveCoupon ? "Save coupon" : ad.couponCode}
                </Button>
              )
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
