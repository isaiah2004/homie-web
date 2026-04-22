import { ThemeToggle } from "@/components/ui/theme-switcher"
import { Separator } from "@/components/ui/separator"

// Standalone header for dev-only pages (`/dev/*`) that render OUTSIDE
// the /dashboard layout — i.e. with no SidebarProvider. Matches the
// visual weight of <SiteHeader/> but drops the sidebar trigger and
// the notification bell (both depend on dashboard context).
export function DevSiteHeader({ pageName }: { pageName: string }) {
  return (
    <header className="my-1 flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator orientation="vertical" className="mr-2" />
        <h1 className="text-base font-medium">{pageName}</h1>
      </div>
      <div className="flex items-center gap-1 pr-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
