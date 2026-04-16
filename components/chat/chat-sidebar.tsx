"use client"

import { useState } from "react"
import { Search, Plus, Phone, PhoneOff, Mic, MicOff, Users, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface Chat {
  id: string
  name: string
  lastMessage: string
  timestamp: string
  unread: number
  isOnline: boolean
  isVoiceActive: boolean
  type: "direct" | "group"
  avatar?: string
}

interface ChatSidebarProps {
  chats: Chat[]
  activeChatId: string | null
  onChatSelect: (chatId: string) => void
  onNewChat: () => void
  onVoiceToggle: (chatId: string) => void
}

export function ChatSidebar({
  chats,
  activeChatId,
  onChatSelect,
  onNewChat,
  onVoiceToggle,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full w-80 flex-col border-r bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Messages</h2>
          <Button onClick={onNewChat} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onChatSelect(chat.id)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-1",
                activeChatId === chat.id
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted"
              )}
            >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={chat.avatar} alt={chat.name} />
                  <AvatarFallback>
                    {chat.type === "group" ? (
                      <Users className="h-5 w-5" />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
                {chat.isOnline && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                )}
                {chat.isVoiceActive && (
                  <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 border-2 border-background animate-pulse" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium truncate">{chat.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {chat.timestamp}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground truncate">
                    {chat.lastMessage}
                  </p>
                  <div className="flex items-center gap-1">
                    {chat.isVoiceActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          onVoiceToggle(chat.id)
                        }}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                      >
                        <PhoneOff className="h-3 w-3" />
                      </Button>
                    )}
                    {chat.unread > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                        {chat.unread}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Voice Status Bar */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Voice Status</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-600">Connected</span>
          </div>
        </div>
      </div>
    </div>
  )
}
