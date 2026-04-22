"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  BotIcon,
  InfoIcon,
  LogOutIcon,
  MoreVerticalIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react"

import { MessageContent } from "@/components/chat/message-content"
import { RichTextComposer } from "@/components/chat/RichTextComposer"
import { NewGroupDialog } from "@/components/chat/NewGroupDialog"
import {
  ReplyModePill,
  type ReplyMode,
} from "@/components/chat/ReplyModePill"
import { AgentResponseCard } from "@/components/chat/AgentResponseCard"
import { GroupInfoDrawer } from "@/components/chat/GroupInfoDrawer"
import { useMutation } from "convex/react"
import {
  CollapseButton,
  ColumnHeader,
  ResizeHandle,
  useResizableWidth,
} from "@/components/dashboard-layout"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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

type DrawerMode = "info" | "homie"

// ─────────────────────────────────────────────────────────────────────────────
// GroupPane
// ─────────────────────────────────────────────────────────────────────────────

export function GroupPane() {
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

  // Fetch the groups list via the identified query. We inline the same
  // skip-dance as DmPane because `useQuery` doesn't easily compose with
  // `useIdentified*`.
  const listArgs = activeUser.isDevMode
    ? activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : null
    : {}
  const groups = useQuery(
    api.groupChats.listGroupChatsForUser,
    viewerId && listArgs !== null ? listArgs : "skip",
  )

  const [activeGroupId, setActiveGroupId] =
    React.useState<Id<"groupChats"> | null>(null)
  const [sidebarFilter, setSidebarFilter] = React.useState("")
  const [drawerMode, setDrawerMode] = React.useState<DrawerMode>("homie")
  const [replyMode, setReplyMode] = React.useState<ReplyMode>("private")
  const [isAgentQuery, setIsAgentQuery] = React.useState(false)

  // Default-select the most recent group once loaded.
  React.useEffect(() => {
    if (activeGroupId) return
    if (!groups || groups.length === 0) return
    setActiveGroupId(groups[0].group._id)
  }, [groups, activeGroupId])

  const listColumn = useResizableWidth({
    initial: 300,
    min: 240,
    max: 520,
    side: "right",
  })
  const [drawerOpen, setDrawerOpen] = React.useState(true)

  if (!clerkLoaded) {
    return <div className="flex-1 p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div className="flex-1 overflow-auto">
        <PickDevUserEmptyState pageName="group chats" />
      </div>
    )
  }
  if (!viewerId) {
    return <div className="flex-1 p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const filteredGroups = (groups ?? []).filter(({ group }) => {
    if (!sidebarFilter.trim()) return true
    return group.name
      .toLowerCase()
      .includes(sidebarFilter.trim().toLowerCase())
  })

  return (
    <div className="flex min-h-0 flex-1">
      {/* ─── Groups column ─── */}
      <div
        className="flex min-h-0 shrink-0 flex-col bg-background"
        style={{ width: `${listColumn.width}px` }}
      >
        <ColumnHeader
          title="Groups"
          actions={
            <NewGroupDialog
              viewerId={viewerId}
              onCreated={(id) => setActiveGroupId(id)}
            />
          }
        />
        <div className="shrink-0 border-b p-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search groups…"
              className="h-8 pl-8 text-sm"
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {groups === undefined ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : filteredGroups.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {groups.length === 0
                  ? "No groups yet. Create one with the + button."
                  : "No match."}
              </div>
            ) : (
              filteredGroups.map(({ group, role, unreadCount }) => (
                <GroupRow
                  key={group._id}
                  group={group}
                  role={role}
                  unread={unreadCount}
                  active={group._id === activeGroupId}
                  onClick={() => setActiveGroupId(group._id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <ResizeHandle
        onMouseDown={listColumn.onMouseDown}
        label="Resize groups list"
      />

      {/* ─── Active group pane + drawer ─── */}
      {activeGroupId ? (
        <GroupThread
          key={activeGroupId}
          groupChatId={activeGroupId}
          viewerId={viewerId}
          drawerMode={drawerMode}
          setDrawerMode={setDrawerMode}
          replyMode={replyMode}
          setReplyMode={setReplyMode}
          isAgentQuery={isAgentQuery}
          setIsAgentQuery={setIsAgentQuery}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          onDeleted={() => setActiveGroupId(null)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
          <p className="text-sm">Select a group to start</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GroupThread — the center (active chat) + right drawer bundle
// ─────────────────────────────────────────────────────────────────────────────

function GroupThread({
  groupChatId,
  viewerId,
  drawerMode,
  setDrawerMode,
  replyMode,
  setReplyMode,
  isAgentQuery,
  setIsAgentQuery,
  drawerOpen,
  setDrawerOpen,
  onDeleted,
}: {
  groupChatId: Id<"groupChats">
  viewerId: Id<"users">
  drawerMode: DrawerMode
  setDrawerMode: (m: DrawerMode) => void
  replyMode: ReplyMode
  setReplyMode: (m: ReplyMode) => void
  isAgentQuery: boolean
  setIsAgentQuery: (v: boolean) => void
  drawerOpen: boolean
  setDrawerOpen: (v: boolean) => void
  onDeleted: () => void
}) {
  const drawerColumn = useResizableWidth({
    initial: 340,
    min: 280,
    max: 560,
    side: "left",
  })
  const { isDevMode, devUserId } = useActiveUser()
  const identityArgs = isDevMode ? (devUserId ? { devUserId } : null) : {}

  const groupInfo = useQuery(
    api.groupChats.getGroupChat,
    identityArgs !== null ? { groupChatId, ...identityArgs } : "skip",
  )
  const messages = useQuery(
    api.groupChatMessages.listMessages,
    identityArgs !== null ? { groupChatId, ...identityArgs } : "skip",
  )
  const agentResponses = useQuery(
    api.groupChatMessages.listAgentResponses,
    identityArgs !== null ? { groupChatId, ...identityArgs } : "skip",
  )
  const pendingAgentResponses = React.useMemo(
    () => (agentResponses ?? []).filter((r) => !r.sharedAsMessageId),
    [agentResponses],
  )

  // Resolve attachments once per view.
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

  const sendGroupMessage = useIdentifiedMutation(
    api.groupChatMessages.sendGroupMessage,
  )
  const askGroupAgent = useIdentifiedMutation(
    api.groupChatMessages.askGroupAgent,
  )
  const shareResponse = useIdentifiedMutation(
    api.groupChatMessages.shareGroupAgentResponse,
  )
  const dismissResponse = useIdentifiedMutation(
    api.groupChatMessages.dismissGroupAgentResponse,
  )
  const markRead = useIdentifiedMutation(
    api.groupChatMessages.markGroupRead,
  )

  React.useEffect(() => {
    // Guard on viewerId so we don't fire the mutation before dev-mode
    // identity has been resolved. Without this, the first few renders call
    // `markRead({ groupChatId })` with no `devUserId` merged in (because
    // useIdentifiedMutation pulls identity from useActiveUser, which resolves
    // asynchronously from localStorage) and Convex throws "Not authenticated".
    if (!groupChatId || !viewerId) return
    markRead({ groupChatId }).catch(() => {})
  }, [groupChatId, viewerId, messages, markRead])

  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const [addMemberOpen, setAddMemberOpen] = React.useState(false)

  async function handleSend(payload: {
    html: string
    plainText: string
    attachmentIds: Id<"attachments">[]
    mentionsHomie: boolean
  }) {
    if (payload.mentionsHomie) {
      try {
        await askGroupAgent({
          groupChatId,
          query: payload.plainText,
          replyMode,
        })
        if (replyMode === "group") {
          toast.success("Asking Homie — reply will be posted to the group")
        } else {
          toast.success("Asking Homie privately")
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to ask")
      }
      return
    }
    try {
      await sendGroupMessage({
        groupChatId,
        content: payload.html,
        format: "html",
        attachmentIds:
          payload.attachmentIds.length > 0
            ? payload.attachmentIds
            : undefined,
        plainText: payload.plainText,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    }
  }

  async function handleShare(responseId: Id<"groupChatAgentResponses">) {
    try {
      await shareResponse({ responseId })
      toast.success("Shared with group")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share")
    }
  }
  async function handleDismiss(responseId: Id<"groupChatAgentResponses">) {
    try {
      await dismissResponse({ responseId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss")
    }
  }

  if (groupInfo === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <p className="text-sm">Loading group…</p>
      </div>
    )
  }
  if (!groupInfo) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <p className="text-sm">Group unavailable</p>
      </div>
    )
  }

  const { group, members, myRole, myUserId } = groupInfo

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <ColumnHeader
          title={
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 text-white">
                <UsersRoundIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">
                  {group.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {group.memberCount} member
                  {group.memberCount === 1 ? "" : "s"}
                  {myRole === "admin" && " · you are admin"}
                </p>
              </div>
            </div>
          }
          actions={
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  setDrawerMode(drawerMode === "info" ? "homie" : "info")
                }
                aria-label="Toggle group info / Homie drawer mode"
              >
                <InfoIcon className="size-4" />
              </Button>
              <GroupHeaderMenu
                groupChatId={groupChatId}
                isAdmin={myRole === "admin"}
                memberCount={group.memberCount}
                onAddMember={() => setAddMemberOpen(true)}
                onViewMembers={() => setDrawerMode("info")}
                onDeleted={onDeleted}
              />
              <CollapseButton
                side="right"
                open={drawerOpen}
                onToggle={() => setDrawerOpen(!drawerOpen)}
                label={drawerOpen ? "Hide group drawer" : "Show group drawer"}
              />
            </>
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
                <GroupMessageBubble
                  key={m._id}
                  message={m}
                  viewerId={viewerId}
                  attachmentsById={attachmentsById}
                  members={members}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="shrink-0 space-y-2 border-t p-4">
          {isAgentQuery && (
            <ReplyModePill
              mode={replyMode}
              onToggle={() =>
                setReplyMode(replyMode === "private" ? "group" : "private")
              }
            />
          )}
          <RichTextComposer
            viewerId={viewerId}
            placeholder="Message…  (tag @homie to ask the group agent)"
            onSend={handleSend}
            onMentionChange={setIsAgentQuery}
            onTabKey={() =>
              setReplyMode(replyMode === "private" ? "group" : "private")
            }
          />
        </div>
      </div>

      {/* ─── Right drawer (collapsible + resizable) ─── */}
      {drawerOpen ? (
        <>
          <ResizeHandle
            onMouseDown={drawerColumn.onMouseDown}
            label="Resize group drawer"
          />
          <div
            className="flex min-h-0 shrink-0 flex-col border-l bg-background"
            style={{ width: `${drawerColumn.width}px` }}
          >
            <div className="flex shrink-0 gap-1 border-b p-2">
              <Button
                size="sm"
                variant={drawerMode === "homie" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => setDrawerMode("homie")}
              >
                <BotIcon className="mr-1 size-3.5" />
                Homie
              </Button>
              <Button
                size="sm"
                variant={drawerMode === "info" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => setDrawerMode("info")}
              >
                <UsersIcon className="mr-1 size-3.5" />
                Group info
              </Button>
              <CollapseButton
                side="right"
                open={drawerOpen}
                onToggle={() => setDrawerOpen(false)}
                label="Hide group drawer"
              />
            </div>

            {drawerMode === "homie" ? (
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 p-3">
                  {pendingAgentResponses.length === 0 ? (
                    <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                      Tag{" "}
                      <code className="rounded bg-muted px-1">@homie</code> in
                      the composer to ask the group agent. Press{" "}
                      <kbd className="rounded bg-muted px-1">Tab</kbd> to
                      switch between a private reply and a group-visible one.
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
                          skillUsed: r.skillUsed,
                          replyMode: r.replyMode,
                        }}
                        actionLabel="Share with group"
                        isGroupMode
                        onShare={
                          r.replyMode === "private"
                            ? () => handleShare(r._id)
                            : undefined
                        }
                        onDismiss={() => handleDismiss(r._id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            ) : (
              <GroupInfoDrawer
                groupChatId={groupChatId}
                members={members}
                myRole={myRole}
                myUserId={myUserId}
                memberCount={group.memberCount}
                onAddMemberClick={() => setAddMemberOpen(true)}
                onDeleted={onDeleted}
              />
            )}
          </div>
        </>
      ) : null}

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        groupChatId={groupChatId}
        viewerId={viewerId}
        existingMemberIds={
          new Set(members.map((m) => m.membership.userId))
        }
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group row in the sidebar
// ─────────────────────────────────────────────────────────────────────────────

function GroupRow({
  group,
  role,
  unread,
  active,
  onClick,
}: {
  group: Doc<"groupChats">
  role: "admin" | "member"
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
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white flex-shrink-0">
          <UsersRoundIcon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1 gap-2">
            <p className="font-medium text-sm truncate">{group.name}</p>
            <div className="flex items-center gap-1 shrink-0">
              {role === "admin" && (
                <Badge variant="outline" className="text-[10px]">
                  Admin
                </Badge>
              )}
              {unread > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                  {unread}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {group.lastPreview ?? `${group.memberCount} members`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatTime(group.lastMessageAt)}
          </p>
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group message bubble
// ─────────────────────────────────────────────────────────────────────────────

function GroupMessageBubble({
  message,
  viewerId,
  attachmentsById,
  members,
}: {
  message: Doc<"groupChatMessages">
  viewerId: Id<"users">
  attachmentsById: Map<string, Doc<"attachments">>
  members: Array<{
    membership: Doc<"groupChatMembers">
    user: Doc<"users"> | null
  }>
}) {
  const mine = message.from === viewerId
  const isAgent = message.author === "agent"
  const sender = members.find((m) => m.user?._id === message.from)?.user
  const forwardedFromUser = message.forwardedFromUserId
    ? members.find((m) => m.user?._id === message.forwardedFromUserId)?.user
    : null

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
      <div className="max-w-[72%] space-y-1">
        {!mine && sender && !isAgent && (
          <p className="text-xs text-muted-foreground px-1">
            {sender.name}
          </p>
        )}
        <div
          className={`p-3 rounded-lg ${
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
              <span>Homie</span>
            </div>
          )}
          {message.forwardedFromMessageId && (
            <div className="mb-1 text-xs italic opacity-80">
              Forwarded
              {forwardedFromUser ? ` from ${forwardedFromUser.name}` : ""}
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
          <p
            className={`text-xs mt-1 ${
              mine && !isAgent
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

// ─────────────────────────────────────────────────────────────────────────────
// Header menu on the active group
// ─────────────────────────────────────────────────────────────────────────────

function GroupHeaderMenu({
  groupChatId,
  isAdmin,
  memberCount,
  onAddMember,
  onViewMembers,
  onDeleted,
}: {
  groupChatId: Id<"groupChats">
  isAdmin: boolean
  memberCount: number
  onAddMember: () => void
  onViewMembers: () => void
  onDeleted: () => void
}) {
  const leave = useIdentifiedMutation(api.groupChats.leaveGroupChat)
  const deleteGroup = useIdentifiedMutation(api.groupChats.deleteGroupChat)

  async function handleLeave() {
    try {
      await leave({ groupChatId })
      toast.success("You left the group")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }
  async function handleDelete() {
    try {
      await deleteGroup({ groupChatId })
      toast.success("Group deleted")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <MoreVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {isAdmin && (
          <DropdownMenuItem onSelect={onAddMember}>
            <UserPlusIcon className="size-3.5 mr-2" />
            Add member
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onViewMembers}>
          <UsersIcon className="size-3.5 mr-2" />
          View members
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLeave}>
          <LogOutIcon className="size-3.5 mr-2" />
          Leave group
        </DropdownMenuItem>
        {isAdmin && memberCount === 1 && (
          <DropdownMenuItem onSelect={handleDelete} variant="destructive">
            Delete group
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-member dialog (friends not already in the group)
// ─────────────────────────────────────────────────────────────────────────────

function AddMemberDialog({
  open,
  onOpenChange,
  groupChatId,
  viewerId,
  existingMemberIds,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  groupChatId: Id<"groupChats">
  viewerId: Id<"users">
  existingMemberIds: Set<Id<"users">>
}) {
  const friends = useQuery(
    api.friends.listFriends,
    viewerId ? { userId: viewerId } : "skip",
  )
  const addMember = useIdentifiedMutation(api.groupChats.addMember)
  const [search, setSearch] = React.useState("")

  const candidates = (friends ?? []).filter(
    ({ friend }) =>
      friend &&
      !existingMemberIds.has(friend._id) &&
      (!search.trim() ||
        friend.name
          .toLowerCase()
          .includes(search.trim().toLowerCase()) ||
        (friend.username ?? "")
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  )

  async function handlePick(newUserId: Id<"users">) {
    try {
      await addMember({ groupChatId, newUserId })
      toast.success("Added to group")
      onOpenChange(false)
      setSearch("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>
            Pick a friend to add to this group. The group has a max of 15
            members.
          </DialogDescription>
        </DialogHeader>
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
            {friends === undefined ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Loading…
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No friends left to add.
              </p>
            ) : (
              candidates.map(({ friend }) =>
                friend ? (
                  <button
                    key={friend._id}
                    type="button"
                    onClick={() => handlePick(friend._id)}
                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-left"
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
