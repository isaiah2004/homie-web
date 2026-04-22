import { AppSidebar } from "@/components/app-sidebar"
import { ConvexUserBootstrap } from "@/components/ConvexUserBootstrap"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      {/* Bootstraps the Clerk → Convex users mapping once per session so
          `accountType` from Clerk's signup metadata lands on the row. See
          components/ConvexUserBootstrap.tsx for the no-op in dev mode. */}
      <ConvexUserBootstrap />
      <AppSidebar variant="inset" />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
