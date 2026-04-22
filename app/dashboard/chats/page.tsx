"use client"

import * as React from "react"

import { SiteHeader } from "@/components/site-header"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { DmPane } from "@/components/chat/DmPane"
import { GroupPane } from "@/components/chat/GroupPane"

// Shell: renders the shared SiteHeader and a shadcn Tabs switcher between
// direct messages and group chats. Both panes own their own identity gate
// (dev-mode switcher vs Clerk) so the shell itself stays dumb.
export default function Page() {
  return (
    <React.Suspense
      fallback={
        <div>
          <SiteHeader pageName="Chats" />
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <ChatsShell />
    </React.Suspense>
  )
}

function ChatsShell() {
  return (
    <div>
      <SiteHeader pageName="Chats" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col p-4 md:p-6">
          <Tabs defaultValue="dms" className="flex-1">
            <TabsList className="self-start">
              <TabsTrigger value="dms">DMs</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
            </TabsList>
            <TabsContent value="dms" className="mt-4">
              <DmPane />
            </TabsContent>
            <TabsContent value="groups" className="mt-4">
              <GroupPane />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
