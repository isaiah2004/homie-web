"use client"

import * as React from "react"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { DmPane } from "@/components/chat/DmPane"
import { GroupPane } from "@/components/chat/GroupPane"

// Shell: renders the shared SiteHeader with tabs lifted into the header's
// center slot so /chats and /friends share the same silhouette (title on
// left, scoped tabs inline, actions on right). Both panes own their own
// identity gate (dev-mode switcher vs Clerk) so the shell itself stays dumb.
//
// The content row is edge-to-edge — the panes render their own columns with
// `border-r` / `border-l` separators rather than floating cards. This matches
// the /dashboard/homie aesthetic.
export default function Page() {
  return (
    <React.Suspense
      fallback={
        <PageShell header={<SiteHeader pageName="Chats" />}>
          <div className="flex-1 p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        </PageShell>
      }
    >
      <ChatsShell />
    </React.Suspense>
  )
}

function ChatsShell() {
  const [tab, setTab] = React.useState<"dms" | "groups">("dms")
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "dms" | "groups")}
      // `gap-0` overrides Tabs' default `gap-2` so the SiteHeader's border-b
      // sits flush against the column content below (matches /dashboard/homie).
      className="flex h-[calc(100vh-1rem)] flex-col gap-0"
    >
      <SiteHeader
        pageName="Chats"
        centerSlot={
          <TabsList className="h-9">
            <TabsTrigger value="dms">DMs</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>
        }
      />
      <TabsContent
        value="dms"
        className="m-0 flex min-h-0 flex-1 overflow-hidden"
      >
        <DmPane />
      </TabsContent>
      <TabsContent
        value="groups"
        className="m-0 flex min-h-0 flex-1 overflow-hidden"
      >
        <GroupPane />
      </TabsContent>
    </Tabs>
  )
}
