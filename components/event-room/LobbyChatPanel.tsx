"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { useIdentifiedMutation } from "@/hooks/use-identified"

import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageContent } from "@/components/chat/message-content"
import { RichTextComposer } from "@/components/chat/RichTextComposer"

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

type Message = Doc<"eventRoomMessages">
type Sender = {
  _id: Id<"users">
  name: string
  username: string | null
  avatar: string | null
} | null

export function LobbyChatPanel({
  eventId,
  viewerId,
}: {
  eventId: Id<"events">
  viewerId: Id<"users">
}) {
  const PAGE_SIZE = 80

  const result = useQuery(api.eventRooms.listRoomMessages, {
    eventId,
    paginationOpts: { numItems: PAGE_SIZE, cursor: null },
  })
  const sendMessage = useIdentifiedMutation(api.eventRooms.sendRoomMessage)
  const markRead = useIdentifiedMutation(api.eventRooms.markRoomRead)

  // Mark-read on mount + whenever new messages arrive (cheap; no-op patch).
  React.useEffect(() => {
    if (!eventId) return
    markRead({ eventId }).catch(() => {})
  }, [eventId, result, markRead])

  // Mark-read on focus.
  React.useEffect(() => {
    function onFocus() {
      markRead({ eventId }).catch(() => {})
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [eventId, markRead])

  // Resolve attachments referenced by visible messages.
  const attachmentIdList = React.useMemo(() => {
    if (!result) return [] as Id<"attachments">[]
    const seen = new Set<string>()
    const out: Id<"attachments">[] = []
    for (const row of result.page) {
      for (const id of row.message.attachmentIds ?? []) {
        if (!seen.has(id)) {
          seen.add(id)
          out.push(id)
        }
      }
    }
    return out
  }, [result])
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

  // Reverse the descending page so it reads bottom-up.
  const ordered = React.useMemo<Array<{ message: Message; sender: Sender }>>(
    () => (result ? [...result.page].reverse() : []),
    [result],
  )

  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [ordered.length])

  async function handleSend(payload: {
    html: string
    plainText: string
    attachmentIds: Id<"attachments">[]
    mentionsHomie: boolean
  }) {
    try {
      await sendMessage({
        eventId,
        content: payload.html,
        format: "html",
        attachmentIds:
          payload.attachmentIds.length > 0 ? payload.attachmentIds : undefined,
        plainText: payload.plainText,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {result === undefined ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : ordered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No messages yet — say hi!
            </p>
          ) : (
            ordered.map(({ message, sender }) => (
              <LobbyMessageBubble
                key={message._id}
                message={message}
                sender={sender}
                viewerId={viewerId}
                attachmentsById={attachmentsById}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t p-3">
        <RichTextComposer
          viewerId={viewerId}
          placeholder="Message the lobby…"
          onSend={handleSend}
        />
      </div>
    </div>
  )
}

function LobbyMessageBubble({
  message,
  sender,
  viewerId,
  attachmentsById,
}: {
  message: Message
  sender: Sender
  viewerId: Id<"users">
  attachmentsById: Map<string, Doc<"attachments">>
}) {
  const mine = message.from === viewerId

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

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[72%] space-y-1">
        {!mine && sender && (
          <p className="px-1 text-xs text-muted-foreground">{sender.name}</p>
        )}
        <div
          className={`rounded-lg p-3 ${
            mine ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          <MessageContent
            content={message.content}
            format={message.format}
            isUser={mine}
            attachments={resolvedAttachments}
          />
          <p
            className={`mt-1 text-xs ${
              mine ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}
          >
            {formatTime(message.sentAt)}
          </p>
        </div>
      </div>
    </div>
  )
}
