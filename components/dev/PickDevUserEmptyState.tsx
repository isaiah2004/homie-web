"use client"

import { ArrowDownRight } from "lucide-react"

// Rendered on pages that need a viewer identity when the app is in dev
// mode but the user hasn't picked a seeded account yet. Without this,
// the page hangs on a generic "Loading…" shell with no breadcrumb.
export function PickDevUserEmptyState({ pageName }: { pageName: string }) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Pick a dev user to view {pageName}
        </p>
        <p className="mt-2 inline-flex items-center gap-1">
          Open the floating <span className="font-mono font-semibold">DEV</span>
          <span> button at the bottom-right and choose a seeded user.</span>
          <ArrowDownRight className="size-4" />
        </p>
        <p className="mt-3">
          First time? Click{" "}
          <span className="font-mono font-semibold">Seed data</span> inside the
          switcher to populate the 5 friends and 3 businesses.
        </p>
      </div>
    </div>
  )
}
