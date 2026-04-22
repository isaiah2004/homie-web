"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { Building2Icon, PlusIcon, UsersIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function roleTone(
  role: "owner" | "admin" | "manager" | "employee",
): "default" | "secondary" | "outline" {
  switch (role) {
    case "owner":
      return "default"
    case "admin":
      return "secondary"
    default:
      return "outline"
  }
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

  const businesses = useQuery(
    api.businesses.listMyBusinesses,
    skip ? "skip" : identityArg,
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Businesses" />
        <PickDevUserEmptyState pageName="businesses" />
      </div>
    )
  }

  return (
    <div>
      <SiteHeader pageName="Businesses" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Your businesses</h2>
              <p className="text-sm text-muted-foreground">
                Organizations you own or are a member of. Create one to run
                ads and chat with your team.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/businesses/new">
                <PlusIcon className="size-4" />
                Create Business
              </Link>
            </Button>
          </div>

          {businesses === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : businesses.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Building2Icon className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No businesses yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a business to set up org chat, manage ads, and
                track analytics.
              </p>
              <Button className="mt-3" size="sm" asChild>
                <Link href="/dashboard/businesses/new">
                  <PlusIcon className="size-3.5" />
                  Create business
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {businesses.map(({ business, role, memberCount }) => (
                <Link
                  key={business._id}
                  href={`/dashboard/businesses/${business._id}`}
                  className="group block overflow-hidden rounded-lg border bg-card transition-colors hover:bg-muted/40"
                >
                  {business.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={business.coverImageUrl}
                      alt=""
                      className="h-24 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-full bg-gradient-to-br from-slate-400 via-indigo-500 to-fuchsia-500" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {business.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={business.logoUrl}
                          alt=""
                          className="size-10 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-md border bg-gradient-to-br from-indigo-400 to-purple-600 text-xs font-semibold text-white">
                          {initials(business.name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-medium">
                            {business.name}
                          </h3>
                          {business.verified && (
                            <Badge variant="secondary" className="text-[10px]">
                              Verified
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {business.category}
                          </Badge>
                          <Badge
                            variant={roleTone(role)}
                            className="text-[10px]"
                          >
                            {role}
                          </Badge>
                          {business.isPaid && (
                            <Badge variant="secondary" className="text-[10px]">
                              Paid
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UsersIcon className="size-3" />
                      <span>
                        {memberCount} member{memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {business.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {business.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
