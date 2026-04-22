import * as React from "react"

import { ThemeToggle } from "@/components/ui/theme-switcher"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/notification-bell"

// SiteHeader — shared top bar for every dashboard page.
//
// Layout:
//   [sidebar-trigger │ pageName]  ⟵ center slot (tabs) ⟶  [actions │ bell │ theme]
//
// `centerSlot` lets a page render tabs / filters / search inline with the
// header so the hero area below stays clean. When omitted the header keeps
// its classic title-on-left appearance.
//
// `rightSlot` is reserved for page-specific actions that should sit next to
// the notification bell (e.g. "New Chat" on /chats). Rendered BEFORE the bell
// so the bell + theme toggle stay anchored to the far right.
export function SiteHeader({
  pageName,
  centerSlot,
  rightSlot,
}: {
  pageName: string
  centerSlot?: React.ReactNode
  rightSlot?: React.ReactNode
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      {/*
        `self-stretch` on the inner groups so the vertical <Separator /> lines
        below can claim the header's full height (via `self-stretch` on the
        separators themselves). Without it, the left group collapses to its
        intrinsic height (~24 px from the <h1>) and the separators float
        mid-header instead of connecting to the border-b line below.
      */}
      <div className="flex flex-1 items-center gap-1 px-4 lg:gap-2 lg:px-6 min-w-0 self-stretch">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-auto self-stretch" />
        <h1 className="text-base font-medium shrink-0">{pageName}</h1>
        {centerSlot ? (
          <>
            <Separator
              orientation="vertical"
              className="mx-3 h-auto self-stretch hidden sm:block"
            />
            <div className="flex-1 min-w-0 flex items-center">
              {centerSlot}
            </div>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-1 pr-2 self-stretch">
        {rightSlot}
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
