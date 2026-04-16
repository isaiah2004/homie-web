"use client"

import { useState, useEffect, useRef } from "react"
import { SiteHeader } from "@/components/site-header"
import { ChatMain } from "@/components/chat/chat-main"
import { useVapiIntegration } from "@/components/chat/vapi-integration"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { MessageCircle, History, Sparkles, Mic, MicOff, Menu } from "lucide-react"

interface Message {
  id: string
  content: string
  sender: "user" | "other"
  timestamp: string
  senderName?: string
  isVoice?: boolean
}

interface Conversation {
  id: string
  title: string
  lastMessage: string
  timestamp: string
  messageCount: number
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "Hey there! I'm Homie, your AI assistant. How can I help you today?",
      sender: "other",
      senderName: "Homie",
      timestamp: "10:00 AM"
    }
  ])

  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: "1",
      title: "Project Planning",
      lastMessage: "Let's break down the features we need",
      timestamp: "Yesterday",
      messageCount: 12
    },
    {
      id: "2", 
      title: "Code Review",
      lastMessage: "The refactoring looks good to me",
      timestamp: "2 days ago",
      messageCount: 8
    },
    {
      id: "3",
      title: "Learning Resources",
      lastMessage: "Here are some great tutorials for React",
      timestamp: "Last week",
      messageCount: 15
    }
  ])

  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(370)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Vapi integration for Homie chatbot
  const vapiConfig = {
    apiKey: process.env.NEXT_PUBLIC_VAPI_API_KEY || "",
    assistantId: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID
  }

  const {
    isCallActive,
    error: vapiError,
    startCall,
    stopCall,
    sendTextMessage,
  } = useVapiIntegration({
    config: vapiConfig,
    onTranscript: (transcript) => {
      // Handle voice transcripts from Homie
      handleHomieResponse(transcript)
    },
    onCallStart: () => {
      console.log("Homie voice call started")
    },
    onCallEnd: () => {
      console.log("Homie voice call ended")
    },
    isActive: isVoiceActive,
  })

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMessage])

    // Simulate Homie response (replace with actual AI integration)
    setTimeout(() => {
      const homieResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: `I understand you're saying: "${content}". Let me help you with that!`,
        sender: "other",
        senderName: "Homie",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages(prev => [...prev, homieResponse])
    }, 1000)

    // Send to Vapi if voice is active
    if (isVoiceActive) {
      sendTextMessage(content)
    }
  }

  const handleHomieResponse = (response: string) => {
    const homieMessage: Message = {
      id: Date.now().toString(),
      content: response,
      sender: "other",
      senderName: "Homie",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoice: true
    }
    setMessages(prev => [...prev, homieMessage])
  }

  const handleVoiceToggle = () => {
    setIsVoiceActive(!isVoiceActive)
    if (!isVoiceActive) {
      startCall()
    } else {
      stopCall()
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true)
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !sidebarRef.current) return

    const containerRect = sidebarRef.current.parentElement?.getBoundingClientRect()
    if (!containerRect) return

    const newWidth = e.clientX - containerRect.left
    const clampedWidth = Math.max(370, Math.min(800, newWidth))
    setSidebarWidth(clampedWidth)
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizing])


  const loadConversation = (conversationId: string) => {
    setSelectedConversation(conversationId)
    // Load conversation messages from backend
    console.log("Loading conversation:", conversationId)
  }

  const startNewConversation = () => {
    setMessages([{
      id: "1",
      content: "Hey there! I'm Homie, your AI assistant. How can I help you today?",
      sender: "other",
      senderName: "Homie",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }])
    setSelectedConversation(null)
  }

  const homieChat = {
    id: "homie",
    name: "Homie AI",
    lastMessage: messages[messages.length - 1]?.content || "Start a conversation",
    timestamp: "Just now",
    unread: 0,
    isOnline: true,
    isVoiceActive,
    type: "direct" as const,
    avatar: "/homie-avatar.png"
  }

  return (
    <div className="h-[calc(100vh-1rem)] flex flex-col">
      <SiteHeader pageName="Homie" />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Collapsible and Resizable */}
        <div 
          ref={sidebarRef}
          className={`flex flex-col border-r bg-background transition-all duration-200 ease-out ${sidebarOpen ? 'min-w-0' : 'w-0 overflow-hidden border-0'}`}
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
        >
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Conversations
            </h2>
            <Button onClick={startNewConversation} size="sm" variant="outline">
              New Chat
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="group cursor-pointer rounded-lg border p-3 transition-all hover:bg-muted/50 hover:border-primary/20"
                  onClick={() => loadConversation(conversation.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate" title={conversation.title}>
                        {conversation.title}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate" title={conversation.lastMessage}>
                        {conversation.lastMessage}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {conversation.timestamp}
                      </span>
                      <Badge variant="secondary" className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        {conversation.messageCount}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Resize Handle */}
        {sidebarOpen && (
          <div 
            className="w-1.5 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors shrink-0 relative group touch-none"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="h-full w-0.5 bg-primary/50 mx-auto rounded-full" />
            </div>
          </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1">
            <ChatMain
              chat={homieChat}
              messages={messages}
              onSendMessage={handleSendMessage}
              onVoiceToggle={handleVoiceToggle}
              sidebarToggle={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              }
            />
          </div>

          {/* Homie Status Bar */}
          <div className="border-t bg-muted/30 p-3 sm:p-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium hidden sm:inline">Homie AI Assistant</span>
                  <span className="text-sm font-medium sm:hidden">Homie</span>
                </div>
                <Badge variant={isVoiceActive ? "default" : "secondary"} className="text-xs">
                  {isVoiceActive ? (
                    <>
                      <Mic className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Voice</span>
                      <span className="sm:hidden">Voice</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Text</span>
                      <span className="sm:hidden">Text</span>
                    </>
                  )}
                </Badge>
              </div>
              
              {vapiError && (
                <div className="text-xs text-red-500 hidden sm:block">
                  {vapiError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
