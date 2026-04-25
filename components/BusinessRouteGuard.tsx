"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAccountType } from "@/hooks/use-account-type"

// Personal-only route prefixes that should soft-redirect business accounts
// back to their own dashboard. The sidebar already hides these entries for
// business, but a deep link / bookmark / old notification can still land
// here — this is the defense-in-depth guard. See BUSINESS_BUGS.md BUG-4.
const PERSONAL_ONLY_PREFIXES = [
  "/dashboard/communities",
  "/dashboard/friends",
  "/dashboard/family",
  "/dashboard/events",
  "/dashboard/my-coupons",
]

export function BusinessRouteGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { accountType, isLoaded } = useAccountType()

  React.useEffect(() => {
    if (!isLoaded) return
    if (accountType !== "business") return
    if (!pathname) return
    const hit = PERSONAL_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
    if (hit) {
      router.replace("/dashboard/business")
    }
  }, [accountType, isLoaded, pathname, router])

  return <>{children}</>
}
