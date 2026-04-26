"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { readActiveCredentials } from "@/hooks/use-local-ai-keys"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"
import {
  CollapseButton,
  ColumnHeader,
  ResizeHandle,
  useResizableWidth,
} from "@/components/dashboard-layout"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  BotIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  SearchIcon,
} from "lucide-react"

import { MessageContent } from "@/components/chat/message-content"
import { RichTextComposer } from "@/components/chat/RichTextComposer"
import { AgentResponseCard } from "@/components/chat/AgentResponseCard"
import { ForwardToGroupDialog } from "@/components/chat/ForwardToGroupDialog"

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const HOMIE_MENTION = /(@homie|@agent)\b/i

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

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

function renderWithHomiePill(content: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /(@homie|@agent)\b/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    parts.push(
      <span
        key={`pill-${match.index}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200 text-xs font-medium align-baseline"
      >
        <BotIcon className="size-3" />
        homie
      </span>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  return parts
}

// ─────────────────────────────────────────────────────────────────────────────
// DmPane
// ─────────────────────────────────────────────────────────────────────────────

export function DmPane() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const withParam = searchParams.get("with") as Id<"users"> | null

  const activeUser = useActiveUser()
  const clerkLoaded = activeUser.isLoaded
  const email = activeUser.email ?? undefined
  const username = activeUser.username ?? undefined
  const name = activeUser.fullName ?? undefined

  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)

  React.useEffect(() => {
    if (activeUser.isDevMode) {
      setViewerId(activeUser.devUserId)
      return
    }
    if (!email) return
    getOrCreateUser({ email, username, name })
      .then((id) => setViewerId(id as Id<"users">))
      .catch((err) => {
        console.error(err)
        toast.error("Failed to sync your account")
      })
  }, [
    activeUser.isDevMode,
    activeUser.devUserId,
    email,
    username,
    name,
    getOrCreateUser,
  ])

  // Queries
  const conversations = useQuery(
    api.dm.listConversations,
    viewerId ? { userId: viewerId } : "skip",
  )
  const friends = useQuery(
    api.friends.listFriends,
    viewerId ? { userId: viewerId } : "skip",
  )

  // Selection
  const [activeConvId, setActiveConvId] =
    React.useState<Id<"dmConversations"> | null>(null)
  const activeConv = React.useMemo(
    () => conversations?.find((c) => c.conversation._id === activeConvId),
    [conversations, activeConvId],
  )

  // Handle ?with=<userId>
  const openConversation = useMutation(api.dm.openConversation)
  React.useEffect(() => {
    if (!viewerId || !withParam) return
    openConversation({ viewerId, otherId: withParam })
      .then((convId) => {
        setActiveConvId(convId as Id<"dmConversations">)
        router.replace("/dashboard/chats")
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : String(err)),
      )
  }, [viewerId, withParam, openConversation, router])

  React.useEffect(() => {
    if (activeConvId) return
    if (!conversations || conversations.length === 0) return
    setActiveConvId(conversations[0].conversation._id)
  }, [conversations, activeConvId])

  const messages = useQuery(
    api.dm.listMessages,
    activeConvId ? { conversationId: activeConvId } : "skip",
  )
  const agentResponses = useQuery(
    api.dm.listAgentResponses,
    activeConvId && viewerId
      ? { conversationId: activeConvId, askerId: viewerId }
      : "skip",
  )
  const pendingAgentResponses = React.useMemo(
    () => (agentResponses ?? []).filter((r) => !r.sharedAsMessageId),
    [agentResponses],
  )

  const attachmentIdList = React.useMemo(() => {
    if (!messages) return [] as Id<"attachments">[]
    const seen = new Set<string>()
    const out: Id<"attachments">[] = []
    for (const m of messages) {
      for (const id of m.attachmentIds ?? []) {
        if (!seen.has(id)) {
          seen.add(id)
          out.push(id)
        }
      }
    }
    return out
  }, [messages])

  const attachmentRows = useQuery(
    api.attachments.getMany,
    attachmentIdList.length > 0 ? { ids: attachmentIdList } : "skip",
  )

  const attachmentsById = React.useMemo(() => {
    const map = new Map<string, Doc<"attachments">>()
    for (const a of attachmentRows ?? []) {
      if (a) map.set(a._id, a)
    }
    return map
  }, [attachmentRows])

  // Mutations
  const sendMessage = useMutation(api.dm.sendMessage)
  const askAgent = useMutation(api.dm.askAgent)
  const shareResponse = useMutation(api.dm.shareAgentResponse)
  const dismissResponse = useMutation(api.dm.dismissAgentResponse)
  const markRead = useMutation(api.dm.markConversationRead)

  React.useEffect(() => {
    if (!activeConvId || !viewerId) return
    markRead({ conversationId: activeConvId, userId: viewerId }).catch(() => {})
  }, [activeConvId, viewerId, messages, markRead])

  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const [isAgentQuery, setIsAgentQuery] = React.useState(false)

  // Forward-to-group dialog state lives at the pane level so the dropdown
  // menu on every bubble can share one dialog instance.
  const [forwardingMessageId, setForwardingMessageId] =
    React.useState<Id<"directMessages"> | null>(null)

  async function handleSend(payload: {
    html: string
    plainText: string
    attachmentIds: Id<"attachments">[]
    mentionsHomie: boolean
  }) {
    if (!viewerId || !activeConv) return
    const otherId = activeConv.other?._id
    if (!otherId) {
      toast.error("Conversation is missing the other participant")
      return
    }

    if (payload.mentionsHomie) {
      const creds = readActiveCredentials()
      await askAgent({
        askerId: viewerId,
        otherId,
        query: payload.plainText,
        llmProvider: creds?.provider,
        llmApiKey: creds?.apiKey,
      })
      toast.success("Asking your agent privately")
      return
    }

    await sendMessage({
      from: viewerId,
      to: otherId,
      content: payload.html,
      format: "html",
      attachmentIds:
        payload.attachmentIds.length > 0 ? payload.attachmentIds : undefined,
      plainText: payload.plainText,
    })
  }

  async function handleShare(responseId: Id<"agentChatResponses">) {
    if (!viewerId) return
    try {
      await shareResponse({ viewerId, responseId })
      toast.success("Shared with your friend")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share")
    }
  }

  async function handleDismiss(responseId: Id<"agentChatResponses">) {
    if (!viewerId) return
    try {
      await dismissResponse({ viewerId, responseId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss")
    }
  }

  // Column widths — user-resizable via drag handles. The active thread in
  // the middle takes whatever space is left (flex-1). Persisted only for
  // this session; a future iteration could mirror into localStorage.
  const listColumn = useResizableWidth({
    initial: 300,
    min: 240,
    max: 520,
    side: "right",
  })
  const drawerColumn = useResizableWidth({
    initial: 340,
    min: 280,
    max: 560,
    side: "left",
  })
  const [drawerOpen, setDrawerOpen] = React.useState(true)

  if (!clerkLoaded) {
    return <div className="flex-1 p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div className="flex-1 overflow-auto">
        <PickDevUserEmptyState pageName="chats" />
      </div>
    )
  }
  if (!viewerId) {
    return <div className="flex-1 p-6 text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ─── Conversations column ─── */}
      <div
        className="flex min-h-0 shrink-0 flex-col bg-background"
        style={{ width: `${listColumn.width}px` }}
      >
        <ColumnHeader
          title="Conversations"
          actions={
            <NewChatButton
              friends={friends ?? []}
              existingOtherIds={
                new Set(
                  (conversations ?? [])
                    .map((c) => c.other?._id)
                    .filter((id): id is Id<"users"> => !!id),
                )
              }
              onPick={async (otherId) => {
                try {
                  const convId = await openConversation({
                    viewerId,
                    otherId,
                  })
                  setActiveConvId(convId as Id<"dmConversations">)
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : String(err),
                  )
                }
              }}
            />
          }
        />
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {conversations === undefined ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : conversations.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                No conversations yet. Start one with a friend.
              </div>
            ) : (
              conversations.map((c) =>
                c.other ? (
                  <ConversationRow
                    key={c.conversation._id}
                    conv={c.conversation}
                    other={c.other}
                    unread={c.unreadCount}
                    active={c.conversation._id === activeConvId}
                    onClick={() => setActiveConvId(c.conversation._id)}
                  />
                ) : null,
              )
            )}
          </div>
        </ScrollArea>
      </div>

      <ResizeHandle
        onMouseDown={listColumn.onMouseDown}
        label="Resize conversations list"
      />

      {/* ─── Active chat column (flex-1) ─── */}
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {!activeConv ? (
          <>
            <ColumnHeader
              title="Messages"
              actions={
                activeConv ? (
                  <CollapseButton
                    side="right"
                    open={drawerOpen}
                    onToggle={() => setDrawerOpen((v) => !v)}
                    label={
                      drawerOpen ? "Hide Homie drawer" : "Show Homie drawer"
                    }
                  />
                ) : null
              }
            />
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <p className="text-sm">Select a conversation to start</p>
            </div>
          </>
        ) : (
          <>
            <ColumnHeader
              title={
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-sm font-semibold text-white">
                    {activeConv.other ? initials(activeConv.other.name) : "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {activeConv.other?.name ?? "Unknown"}
                    </p>
                    {activeConv.other?.username && (
                      <p className="truncate text-xs text-muted-foreground">
                        @{activeConv.other.username}
                      </p>
                    )}
                  </div>
                </div>
              }
              actions={
                <CollapseButton
                  side="right"
                  open={drawerOpen}
                  onToggle={() => setDrawerOpen((v) => !v)}
                  label={
                    drawerOpen ? "Hide Homie drawer" : "Show Homie drawer"
                  }
                />
              }
            />

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {messages === undefined ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : messages.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No messages yet. Say hi 👋
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m._id}
                      message={m}
                      viewerId={viewerId}
                      attachmentsById={attachmentsById}
                      onForward={() => setForwardingMessageId(m._id)}
                      onCopy={async () => {
                        const text =
                          m.format === "html"
                            ? m.content.replace(/<[^>]+>/g, " ").trim()
                            : m.content
                        await navigator.clipboard.writeText(text).catch(() => {})
                        toast.success("Copied")
                      }}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="shrink-0 space-y-2 border-t p-4">
              {isAgentQuery && (
                <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700">
                  <BotIcon className="size-3.5" />
                  <span>
                    This will be sent privately to your agent. Use “Share” on
                    the reply to send it to{" "}
                    {activeConv.other?.name ?? "your friend"}.
                  </span>
                </div>
              )}
              <RichTextComposer
                viewerId={viewerId}
                placeholder="Message…  (tag @homie to ask privately)"
                onSend={handleSend}
                onMentionChange={setIsAgentQuery}
              />
            </div>
          </>
        )}
      </div>

      {/* ─── Homie drawer column (collapsible + resizable) ─── */}
      {activeConv && drawerOpen ? (
        <>
          <ResizeHandle
            onMouseDown={drawerColumn.onMouseDown}
            label="Resize Homie drawer"
          />
          <div
            className="flex min-h-0 shrink-0 flex-col bg-background"
            style={{ width: `${drawerColumn.width}px` }}
          >
            <ColumnHeader
              icon={<BotIcon className="size-4 text-violet-600" />}
              title={
                <span className="flex items-center gap-2">
                  Homie drawer
                  <Badge variant="outline" className="text-[10px]">
                    Private
                  </Badge>
                </span>
              }
              actions={
                <CollapseButton
                  side="right"
                  open={drawerOpen}
                  onToggle={() => setDrawerOpen(false)}
                  label="Hide Homie drawer"
                />
              }
            />
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3">
                {pendingAgentResponses.length === 0 ? (
                  <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                    Tag{" "}
                    <code className="rounded bg-muted px-1">@homie</code> in
                    the composer to ask privately (plans, prices, logistics).
                    Answers appear here until you share them.
                  </div>
                ) : (
                  pendingAgentResponses.map((r) => (
                    <AgentResponseCard
                      key={r._id}
                      response={{
                        _id: r._id,
                        query: r.query,
                        content: r.content,
                        status: r.status,
                        error: r.error,
                      }}
                      actionLabel={`Share with ${activeConv.other?.name ?? "friend"}`}
                      onShare={() => handleShare(r._id)}
                      onDismiss={() => handleDismiss(r._id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </>
      ) : null}

      <ForwardToGroupDialog
        sourceMessageId={forwardingMessageId}
        onOpenChange={(open) => {
          if (!open) setForwardingMessageId(null)
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row / card components
// ─────────────────────────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  other,
  unread,
  active,
  onClick,
}: {
  conv: Doc<"dmConversations">
  other: Doc<"users">
  unread: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        active ? "bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
          {initials(other.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-sm truncate">{other.name}</p>
            {unread > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1.5">
                {unread}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {conv.lastPreview ?? "No messages yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatTime(conv.lastMessageAt)}
          </p>
        </div>
      </div>
    </button>
  )
}

function MessageBubble({
  message,
  viewerId,
  attachmentsById,
  onForward,
  onCopy,
}: {
  message: Doc<"directMessages">
  viewerId: Id<"users">
  attachmentsById: Map<string, Doc<"attachments">>
  onForward: () => void
  onCopy: () => void
}) {
  const mine = message.from === viewerId
  const isAgent = message.author === "agent"

  const resolvedAttachments = React.useMemo(() => {
    if (!message.attachmentIds || message.attachmentIds.length === 0) return []
    return message.attachmentIds
      .map((id) => attachmentsById.get(id))
      .filter((a): a is Doc<"attachments"> => !!a)
      .map((a) => ({
        id: a._id,
        kind: a.kind,
        fileName: a.fileName,
        publicUrl: a.publicUrl,
        contentType: a.contentType,
        size: a.size,
      }))
  }, [message.attachmentIds, attachmentsById])

  const plainForPill = React.useMemo(() => {
    if (message.format === "html") {
      return message.content.replace(/<[^>]+>/g, " ")
    }
    return message.content
  }, [message.content, message.format])

  const hasMention = HOMIE_MENTION.test(plainForPill)

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`group relative max-w-[70%] p-3 rounded-lg ${
          mine
            ? isAgent
              ? "bg-violet-100 border border-violet-200 text-violet-900"
              : "bg-primary text-primary-foreground"
            : isAgent
              ? "bg-violet-50 border border-violet-200 text-violet-900"
              : "bg-muted"
        }`}
      >
        {isAgent && (
          <div className="flex items-center gap-1 text-xs font-medium mb-1">
            <BotIcon className="size-3.5" />
            <span>{mine ? "Your agent" : "Their agent"} · shared</span>
          </div>
        )}
        {hasMention && !isAgent && message.format !== "html" ? (
          <p className="text-sm whitespace-pre-wrap break-words">
            {renderWithHomiePill(message.content)}
          </p>
        ) : (
          <MessageContent
            content={message.content}
            format={message.format}
            isUser={mine && !isAgent}
            attachments={resolvedAttachments}
          />
        )}
        <div className="flex items-center justify-between mt-1 gap-2">
          <p
            className={`text-xs ${
              mine && !isAgent
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
            }`}
          >
            {formatTime(message.sentAt)}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More"
                className={`rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 ${
                  mine && !isAgent
                    ? "text-primary-foreground/80 hover:bg-primary-foreground/10"
                    : "text-muted-foreground hover:bg-background/50"
                }`}
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={onForward}>
                Forward to group…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCopy}>Copy</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// New-chat picker
// ─────────────────────────────────────────────────────────────────────────────

function NewChatButton({
  friends,
  existingOtherIds,
  onPick,
}: {
  friends: Array<{ edge: Doc<"friends">; friend: Doc<"users"> | null }>
  existingOtherIds: Set<Id<"users">>
  onPick: (otherId: Id<"users">) => Promise<void> | void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const candidates = friends
    .filter((f) => f.friend && !existingOtherIds.has(f.friend._id))
    .filter(({ friend }) => {
      if (!friend) return false
      if (!search.trim()) return true
      const needle = search.trim().toLowerCase()
      return (
        friend.name.toLowerCase().includes(needle) ||
        (friend.username ?? "").toLowerCase().includes(needle)
      )
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquarePlusIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new chat</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search friends…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ScrollArea className="max-h-80">
            <div className="space-y-1">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No friends without a conversation. Visit the Friends tab to
                  add more.
                </p>
              ) : (
                candidates.map(({ friend }) =>
                  friend ? (
                    <button
                      key={friend._id}
                      type="button"
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-left"
                      onClick={async () => {
                        await onPick(friend._id)
                        setOpen(false)
                        setSearch("")
                      }}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold">
                        {initials(friend.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {friend.name}
                        </p>
                        {friend.username && (
                          <p className="text-xs text-muted-foreground truncate">
                            @{friend.username}
                          </p>
                        )}
                      </div>
                    </button>
                  ) : null,
                )
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
