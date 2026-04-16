"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Phone, PhoneOff, Mic, MicOff, MoreVertical, Search, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Message {
  id: string
  content: string
  sender: "user" | "other"
  timestamp: string
  senderName?: string
  isVoice?: boolean
}

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

interface ChatMainProps {
  chat: Chat | null
  messages: Message[]
  onSendMessage: (content: string) => void
  onVoiceToggle: () => void
  onBackToList?: () => void
  sidebarToggle?: React.ReactNode
}

export function ChatMain({
  chat,
  messages,
  onSendMessage,
  onVoiceToggle,
  onBackToList,
  sidebarToggle,
}: ChatMainProps) {
  const [messageInput, setMessageInput] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Scroll to bottom when new messages are added
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }, [messages])

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      onSendMessage(messageInput.trim())
      setMessageInput("")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const toggleRecording = () => {
    setIsRecording(!isRecording)
    // Here you would integrate with Vapi for voice recording
  }

  if (!chat) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
          <p className="text-sm">Choose a chat from the sidebar or start a new conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 h-[65px]">
        <div className="flex items-center gap-3">
          {sidebarToggle}
          {onBackToList && (
            <Button variant="ghost" size="sm" onClick={onBackToList} className="md:hidden">
              <span className="mr-1">Back</span>
            </Button>
          )}
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarImage src={chat.avatar} alt={chat.name} />
              <AvatarFallback>{chat.name.charAt(0)}</AvatarFallback>
            </Avatar>
            {chat.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
            )}
          </div>
          <div>
            <h3 className="font-medium">{chat.name}</h3>
            <p className="text-sm text-muted-foreground">
              {chat.isOnline ? "Online" : "Offline"}
              {chat.isVoiceActive && " • In voice call"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={chat.isVoiceActive ? "destructive" : "default"}
            size="sm"
            onClick={onVoiceToggle}
            className="gap-2"
          >
            {chat.isVoiceActive ? (
              <>
                <PhoneOff className="h-4 w-4" />
                End Call
              </>
            ) : (
              <>
                <Phone className="h-4 w-4" />
                Voice Call
              </>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Search className="h-4 w-4 mr-2" />
                Search Messages
              </DropdownMenuItem>
              <DropdownMenuItem>
                <UserPlus className="h-4 w-4 mr-2" />
                Add to Friends
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                Delete Conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  message.sender === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {message.sender === "other" && message.senderName && (
                  <p className="text-xs font-medium mb-1 opacity-70">
                    {message.senderName}
                  </p>
                )}
                <p className="text-sm">{message.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs opacity-70">{message.timestamp}</p>
                  {message.isVoice && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      🎤 Voice
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="p-4 border-t shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleRecording}
            className={isRecording ? "text-red-500" : ""}
          >
            {isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
          
          <Input
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          
          <Button onClick={handleSendMessage} size="sm" disabled={!messageInput.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        {isRecording && (
          <div className="mt-2 flex items-center gap-2 text-sm text-red-500">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Recording... (Voice integration with Vapi)
          </div>
        )}
      </div>
    </div>
  )
}
