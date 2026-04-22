"use client"

import * as React from "react"
import { BotIcon, Share2Icon, Trash2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { MessageContent } from "@/components/chat/message-content"

// Shared card rendered in DmPane's agent drawer and GroupPane's homie drawer.
// `response` is intentionally a narrow shape with just the columns we need so
// both the `agentChatResponses` (DM) and `groupChatAgentResponses` (group)
// tables can reuse the same component.
export type AgentResponseCardData = {
  _id: string
  query: string
  content: string
  status: "pending" | "ready" | "failed"
  error?: string
  skillUsed?: "findHangout" | "pickMovie" | "scheduleEvent" | "general"
  replyMode?: "private" | "group"
}

export function AgentResponseCard({
  response,
  actionLabel,
  onShare,
  onDismiss,
  isGroupMode,
}: {
  response: AgentResponseCardData
  // Primary action label on the Share button. For DMs this is "Share with
  // {friend name}", for groups "Share with group" etc.
  actionLabel?: string
  onShare?: () => void
  onDismiss?: () => void
  isGroupMode?: boolean
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
        {response.skillUsed && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {labelForSkill(response.skillUsed)}
          </Badge>
        )}
      </div>
      <Separator />
      {response.status === "pending" ? (
        <p className="text-sm text-muted-foreground italic">Thinking…</p>
      ) : response.status === "failed" ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Agent failed: {response.error ?? "unknown error"}
          </p>
          {onDismiss && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDismiss}
              className="w-full"
            >
              <XIcon className="size-3 mr-1" />
              Dismiss
            </Button>
          )}
        </div>
      ) : (
        <>
          <MessageContent
            content={response.content}
            format="markdown"
            isUser={false}
          />
          {(onShare || onDismiss) && (
            <div className="flex gap-2">
              {onShare && (
                <Button size="sm" className="flex-1" onClick={onShare}>
                  <Share2Icon className="size-3 mr-1" />
                  {actionLabel ??
                    (isGroupMode ? "Share with group" : "Share")}
                </Button>
              )}
              {onDismiss && (
                <Button size="sm" variant="outline" onClick={onDismiss}>
                  <Trash2Icon className="size-3" />
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function labelForSkill(
  skill: "findHangout" | "pickMovie" | "scheduleEvent" | "general",
) {
  switch (skill) {
    case "findHangout":
      return "Find hangout"
    case "pickMovie":
      return "Pick movie"
    case "scheduleEvent":
      return "Schedule"
    case "general":
      return "Chat"
  }
}
