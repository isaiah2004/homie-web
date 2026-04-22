"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeftIcon, BarChart3Icon } from "lucide-react"

import { Id } from "@/convex/_generated/dataModel"

import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"

export default function Page() {
  const params = useParams<{ id: string }>()
  const businessId = params.id as Id<"businesses">

  return (
    <div>
      <SiteHeader pageName="Analytics" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>

          <div className="rounded-lg border border-dashed bg-card p-10 text-center">
            <BarChart3Icon className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold">Analytics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Impressions, clicks, coupon saves, and coupon use will land
              here once ad tracking ships in PR #8.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
