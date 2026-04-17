"use client"

import { Phone, PhoneCall } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  id: string
  content: string
  sender: "user" | "other"
  senderName?: string
  timestamp: string
  role?: "user" | "assistant" | "system"
}

interface VoiceConversationProps {
  title: string
  messages: Message[]
  onStartNewCall: () => void
  sidebarToggle?: React.ReactNode
}

export function VoiceConversation({
  title,
  messages,
  onStartNewCall,
  sidebarToggle,
}: VoiceConversationProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 h-[65px]">
        <div className="flex items-center gap-3">
          {sidebarToggle}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground">Voice call transcript</p>
          </div>
        </div>
        <Button onClick={onStartNewCall} size="sm" className="gap-2">
          <PhoneCall className="h-4 w-4" />
          Start new call
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground italic">
            No transcript recorded for this call.
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border p-3 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {m.role === "assistant" ? "Homie" : "You"}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.timestamp}</span>
                </div>
                <p className="text-sm leading-relaxed">{m.content}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
