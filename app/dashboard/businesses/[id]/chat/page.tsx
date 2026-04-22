"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  HashIcon,
  SendIcon,
  UsersRoundIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { MessageContent } from "@/components/chat/message-content"

function formatTime(ms: number) {
  const d = new Date(ms)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

export default function Page() {
  const activeUser = useActiveUser()
  const params = useParams<{ id: string }>()
  const businessId = params.id as Id<"businesses">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const viewerData = useQuery(
    api.businesses.getBusinessForViewer,
    skip ? "skip" : { businessId, ...identityArg },
  )
  const channels = useQuery(
    api.orgChannels.listChannels,
    skip ? "skip" : { businessId, ...identityArg },
  )
  const memberData = useQuery(
    api.businessMembers.listMembers,
    skip ? "skip" : { businessId, ...identityArg },
  )

  const [activeChannelId, setActiveChannelId] =
    React.useState<Id<"orgChannels"> | null>(null)

  // Default-select the first (oldest) channel once the list loads.
  React.useEffect(() => {
    if (activeChannelId) return
    if (!channels || channels.length === 0) return
    setActiveChannelId(channels[0]._id)
  }, [channels, activeChannelId])

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="Org chat" />
        <PickDevUserEmptyState pageName="businesses" />
      </div>
    )
  }

  if (viewerData === undefined) {
    return (
      <div>
        <SiteHeader pageName="Org chat" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  // Short-circuit on non-members before `channels` resolves — otherwise the
  // underlying query throws and we'd show a perpetual "Loading…" shell.
  if (viewerData === null || viewerData.myRole === null) {
    return (
      <div>
        <SiteHeader pageName="Org chat" />
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Not allowed</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You don&apos;t have access to this business.
            </p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/businesses">Back to businesses</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (channels === undefined) {
    return (
      <div>
        <SiteHeader pageName="Org chat" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  const membersById = new Map<Id<"users">, Doc<"users">>()
  for (const row of memberData?.members ?? []) {
    if (row.user) membersById.set(row.membership.userId, row.user)
  }

  return (
    <div>
      <SiteHeader pageName="Org chat" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="flex h-[calc(100vh-220px)] gap-4">
            <div className="flex w-60 flex-col overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center gap-2 border-b p-4">
                <UsersRoundIcon className="size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {viewerData.business.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Org channels
                  </p>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-1 p-2">
                  {channels.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No channels yet.
                    </p>
                  ) : (
                    channels.map((ch) => (
                      <button
                        key={ch._id}
                        type="button"
                        onClick={() => setActiveChannelId(ch._id)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          activeChannelId === ch._id
                            ? "bg-muted"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <HashIcon className="size-4 text-muted-foreground" />
                        <span className="truncate">{ch.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card">
              {activeChannelId ? (
                <ChannelThread
                  channelId={activeChannelId}
                  membersById={membersById}
                  myUserId={memberData?.myUserId ?? null}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Pick a channel to start
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChannelThread({
  channelId,
  membersById,
  myUserId,
}: {
  channelId: Id<"orgChannels">
  membersById: Map<Id<"users">, Doc<"users">>
  myUserId: Id<"users"> | null
}) {
  const messages = useQuery(api.orgChannels.listMessages, { channelId })
  const sendMessage = useIdentifiedMutation(api.orgChannels.sendMessage)

  const [value, setValue] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend() {
    const trimmed = value.trim()
    if (!trimmed) return
    setSending(true)
    try {
      await sendMessage({
        channelId,
        content: trimmed,
        format: "text",
      })
      setValue("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {messages === undefined ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : messages.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No messages yet. Say hi to the team.
            </div>
          ) : (
            messages.map((m) => (
              <MessageRow
                key={m._id}
                message={m}
                sender={membersById.get(m.from) ?? null}
                mine={m.from === myUserId}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            rows={2}
            placeholder="Message #channel…"
            className="resize-none"
          />
          <Button disabled={sending || !value.trim()} onClick={handleSend}>
            <SendIcon className="size-4" />
            Send
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Enter to send, Shift+Enter for newline.
        </p>
      </div>
    </>
  )
}

function MessageRow({
  message,
  sender,
  mine,
}: {
  message: Doc<"orgChannelMessages">
  sender: Doc<"users"> | null
  mine: boolean
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[72%] space-y-1">
        {!mine && sender && (
          <div className="flex items-center gap-1.5 px-1">
            <Badge variant="outline" className="text-[10px]">
              {sender.name}
            </Badge>
            {sender.username && (
              <span className="text-[10px] text-muted-foreground">
                @{sender.username}
              </span>
            )}
          </div>
        )}
        <div
          className={`rounded-lg p-3 ${
            mine ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          <MessageContent
            content={message.content}
            // Our schema uses "text" | "markdown"; MessageContent expects
            // "plain" | "markdown" | "html". Map accordingly.
            format={message.format === "text" ? "plain" : "markdown"}
            isUser={mine}
          />
          <p
            className={`mt-1 text-[10px] ${
              mine
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
            }`}
          >
            {formatTime(message.sentAt)}
          </p>
        </div>
      </div>
    </div>
  )
}

