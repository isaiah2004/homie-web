// import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-switcher"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({ pageName }: { pageName: string }) {
  return (
    <header className="my-1 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2" />
        <h1 className="text-base font-medium">{pageName}</h1>
      </div>
      <div className="pr-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
