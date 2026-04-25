"use client"

import * as React from "react"

// Layout shell for /dashboard/family/[childId]/*. Currently a thin pass-through
// so the page itself owns the SiteHeader (which displays the child's name).
// Kept as a layout file so future shared chrome (breadcrumbs, locked-account
// interstitial) can land here without page-level churn.
export default function ChildLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
