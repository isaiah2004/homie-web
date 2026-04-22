"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { AlertTriangleIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// The /dev/billing page is a dev-only admin panel for flipping `isPaid`
// on businesses. It's the stopgap until the real payments webhook lands
// in a later PR. Accessible only in dev mode — we gate server-side AND
// render a banner client-side so the page doesn't blank in prod either.

export default function Page() {
  const activeUser = useActiveUser()
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

  const skip = !activeUser.isLoaded || !isDevMode
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const businesses = useQuery(
    api.businesses.listAllForDev,
    skip ? "skip" : identityArg,
  )

  const devMarkPaid = useIdentifiedMutation(api.billing.devMarkPaid)

  if (!isDevMode) {
    return (
      <div>
        <SiteHeader pageName="Dev billing" />
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border border-dashed p-6 text-center">
            <AlertTriangleIcon className="mx-auto size-6 text-amber-500" />
            <p className="mt-3 text-sm font-medium">Dev mode required</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This page is only available when{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                NEXT_PUBLIC_DEV_MODE
              </code>{" "}
              is <code>true</code>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Dev billing" />
        <PickDevUserEmptyState pageName="dev billing" />
      </div>
    )
  }

  async function handleToggle(
    businessId: string,
    currentPaid: boolean,
    name: string,
  ) {
    try {
      await devMarkPaid({
        kind: "business",
        id: businessId,
        paid: !currentPaid,
      })
      toast.success(
        `${name} marked ${!currentPaid ? "paid" : "unpaid"}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <div>
      <SiteHeader pageName="Dev billing" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangleIcon className="size-4 shrink-0" />
              <span>
                <span className="font-semibold">Dev only.</span> This page
                flips the <code className="rounded bg-amber-500/20 px-1">isPaid</code>{" "}
                flag locally to exercise paid-feature gates. In production
                the flag is updated by the payments webhook.
              </span>
            </p>
          </div>

          <h2 className="mt-4 text-lg font-semibold">All businesses</h2>

          <div className="mt-2 rounded-lg border bg-card">
            {businesses === undefined ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : businesses.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No businesses yet. Use the floating DEV switcher to seed
                data, then create one from the Businesses page.
              </p>
            ) : (
              <ul className="divide-y">
                {businesses.map((b) => (
                  <li
                    key={b._id}
                    className="flex items-center gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {b.category}
                        </Badge>
                        <Badge
                          variant={b.isPaid ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {b.isPaid ? "Paid" : "Unpaid"}
                        </Badge>
                        {b.verified && (
                          <Badge variant="secondary" className="text-[10px]">
                            Verified
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={b.isPaid ? "outline" : "default"}
                      onClick={() => handleToggle(b._id, b.isPaid, b.name)}
                    >
                      {b.isPaid ? "Mark unpaid" : "Mark paid"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
