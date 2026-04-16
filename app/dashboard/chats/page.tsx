"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  BotIcon,
  CheckIcon,
  MessageSquarePlusIcon,
  SearchIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_MENTION = /@agent\b/i

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

// Split composer text so `@agent` renders as a styled pill while the rest
// stays plain text. Used both in the composer preview and in rendered
// messages that happen to contain an agent mention.
function renderWithAgentPill(content: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /@agent\b/gi
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
        agent
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
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <React.Suspense fallback={<div><SiteHeader pageName="Chats" /><div className="p-6 text-sm text-muted-foreground">Loading…</div></div>}>
      <ChatsContent />
    </React.Suspense>
  )
}

function ChatsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const withParam = searchParams.get("with") as Id<"users"> | null

  const { user: clerkUser, isLoaded: clerkLoaded } = useUser()
  const email = clerkUser?.primaryEmailAddress?.emailAddress
  const username = clerkUser?.username ?? undefined
  const clerkName =
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.username ||
    undefined

  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)

  React.useEffect(() => {
    if (!email) return
    getOrCreateUser({ email, username, name: clerkName })
      .then((id) => setViewerId(id as Id<"users">))
      .catch((err) => {
        console.error(err)
        toast.error("Failed to sync your account")
      })
  }, [email, username, clerkName, getOrCreateUser])

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

  // Handle ?with=<userId>: open or start a conversation with that friend.
  const openConversation = useMutation(api.dm.openConversation)
  React.useEffect(() => {
    if (!viewerId || !withParam) return
    openConversation({ viewerId, otherId: withParam })
      .then((convId) => {
        setActiveConvId(convId as Id<"dmConversations">)
        // Drop the param so we don't re-trigger on every render.
        router.replace("/dashboard/chats")
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
  }, [viewerId, withParam, openConversation, router])

  // Default-select the most recent conversation once loaded, unless the URL
  // already picked one via `?with=`.
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

  // Mutations
  const sendMessage = useMutation(api.dm.sendMessage)
  const askAgent = useMutation(api.dm.askAgent)
  const shareResponse = useMutation(api.dm.shareAgentResponse)
  const dismissResponse = useMutation(api.dm.dismissAgentResponse)
  const markRead = useMutation(api.dm.markConversationRead)

  // Mark as read when a conversation opens or new inbound messages arrive.
  React.useEffect(() => {
    if (!activeConvId || !viewerId) return
    markRead({ conversationId: activeConvId, userId: viewerId }).catch(() => {
      // swallow — next open will retry
    })
  }, [activeConvId, viewerId, messages, markRead])

  // Auto-scroll to newest message when the list changes.
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Composer state
  const [composerText, setComposerText] = React.useState("")
  const isAgentQuery = AGENT_MENTION.test(composerText)

  async function handleSubmit() {
    if (!viewerId || !activeConv) return
    const text = composerText.trim()
    if (!text) return

    const otherId = activeConv.other?._id
    if (!otherId) {
      toast.error("Conversation is missing the other participant")
      return
    }

    setComposerText("")
    try {
      if (AGENT_MENTION.test(text)) {
        await askAgent({
          askerId: viewerId,
          otherId,
          query: text,
        })
        toast.success("Asking your agent privately")
      } else {
        await sendMessage({ from: viewerId, to: otherId, content: text })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
      setComposerText(text)
    }
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

  // Loading gate
  if (!clerkLoaded || !viewerId) {
    return (
      <div>
        <SiteHeader pageName="Chats" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  return (
    <div>
      <SiteHeader pageName="Chats" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col p-4 md:p-6">
          <div className="flex gap-4 h-[calc(100vh-160px)]">
            {/* ─── Conversations sidebar ─── */}
            <div className="w-72 border rounded-lg bg-card flex flex-col overflow-hidden">
              <div className="p-4 border-b shrink-0 flex items-center justify-between">
                <h3 className="font-semibold">Conversations</h3>
                <NewChatButton
                  friends={friends ?? []}
                  existingOtherIds={new Set(
                    (conversations ?? [])
                      .map((c) => c.other?._id)
                      .filter((id): id is Id<"users"> => !!id),
                  )}
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
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-2 space-y-1">
                  {conversations === undefined ? (
                    <p className="text-center text-sm text-muted-foreground py-6">
                      Loading…
                    </p>
                  ) : conversations.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-6 px-2">
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
                          onClick={() =>
                            setActiveConvId(c.conversation._id)
                          }
                        />
                      ) : null,
                    )
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* ─── Active chat pane ─── */}
            <div className="flex-1 border rounded-lg bg-card flex flex-col overflow-hidden">
              {!activeConv ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Select a conversation to start</p>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold">
                      {activeConv.other ? initials(activeConv.other.name) : "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {activeConv.other?.name ?? "Unknown"}
                      </p>
                      {activeConv.other?.username && (
                        <p className="text-xs text-muted-foreground truncate">
                          @{activeConv.other.username}
                        </p>
                      )}
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-3">
                      {messages === undefined ? (
                        <p className="text-center text-sm text-muted-foreground py-6">
                          Loading…
                        </p>
                      ) : messages.length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-6">
                          No messages yet. Say hi 👋
                        </div>
                      ) : (
                        messages.map((m) => (
                          <MessageBubble
                            key={m._id}
                            message={m}
                            viewerId={viewerId}
                          />
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Composer */}
                  <div className="p-4 border-t space-y-2">
                    {isAgentQuery && (
                      <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-3 py-1.5">
                        <BotIcon className="size-3.5" />
                        <span>
                          This will be sent privately to your agent. Use
                          “Share” on the reply to send it to{" "}
                          {activeConv.other?.name ?? "your friend"}.
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Message…  (tag @agent to ask privately)"
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleSubmit()
                          }
                        }}
                        className="flex-1"
                      />
                      <Button onClick={handleSubmit} disabled={!composerText.trim()}>
                        {isAgentQuery ? (
                          <>
                            <SparklesIcon className="size-4 mr-1" />
                            Ask agent
                          </>
                        ) : (
                          "Send"
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ─── Agent drawer (private) ─── */}
            {activeConv && (
              <div className="w-80 border rounded-lg bg-card flex flex-col overflow-hidden">
                <div className="p-4 border-b shrink-0 flex items-center gap-2">
                  <BotIcon className="size-4 text-violet-600" />
                  <h3 className="font-semibold">Agent drawer</h3>
                  <Badge variant="outline" className="text-xs">
                    Private
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-3">
                    {pendingAgentResponses.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-8 px-2">
                        Tag <code className="px-1 bg-muted rounded">@agent</code>{" "}
                        in the composer to ask a private question (plans,
                        prices, logistics). Answers appear here until you
                        share them.
                      </div>
                    ) : (
                      pendingAgentResponses.map((r) => (
                        <AgentResponseCard
                          key={r._id}
                          response={r}
                          otherName={activeConv.other?.name ?? "friend"}
                          onShare={() => handleShare(r._id)}
                          onDismiss={() => handleDismiss(r._id)}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      </div>
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
}: {
  message: Doc<"directMessages">
  viewerId: Id<"users">
}) {
  const mine = message.from === viewerId
  const isAgent = message.author === "agent"

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] p-3 rounded-lg ${
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
            <span>
              {mine ? "Your agent" : "Their agent"} · shared
            </span>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">
          {renderWithAgentPill(message.content)}
        </p>
        <p
          className={`text-xs mt-1 ${
            mine && !isAgent ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {formatTime(message.sentAt)}
        </p>
      </div>
    </div>
  )
}

function AgentResponseCard({
  response,
  otherName,
  onShare,
  onDismiss,
}: {
  response: Doc<"agentChatResponses">
  otherName: string
  onShare: () => void
  onDismiss: () => void
}) {
  return (
    <div className="p-3 rounded-lg border bg-violet-50/40 border-violet-200 space-y-2">
      <div className="flex items-start gap-2">
        <BotIcon className="size-4 text-violet-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground italic truncate">
            Q: {response.query}
          </p>
        </div>
      </div>
      <Separator />
      {response.status === "pending" ? (
        <p className="text-sm text-muted-foreground italic">Thinking…</p>
      ) : response.status === "failed" ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Agent failed: {response.error ?? "unknown error"}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onDismiss}
            className="w-full"
          >
            <XIcon className="size-3 mr-1" />
            Dismiss
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap">{response.content}</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={onShare}>
              <Share2Icon className="size-3 mr-1" />
              Share with {otherName}
            </Button>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// New-chat picker (friends the user hasn't opened a conversation with yet)
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
