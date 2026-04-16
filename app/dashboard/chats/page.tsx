"use client"

import { useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatMain } from "@/components/chat/chat-main"
import { UserDiscovery } from "@/components/chat/user-discovery"
import { useVapiIntegration } from "@/components/chat/vapi-integration"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MessageSquare, Users } from "lucide-react"

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

interface Message {
  id: string
  content: string
  sender: "user" | "other"
  timestamp: string
  senderName?: string
  isVoice?: boolean
}

export default function Page() {
  const [activeTab, setActiveTab] = useState("chats")
  const [activeChatId, setActiveChatId] = useState<string | null>(null)

  // Mock data for user-to-user chats
  const [chats, setChats] = useState<Chat[]>([
    {
      id: "1",
      name: "Sarah Chen",
      lastMessage: "Hey! Want to collaborate on the new project?",
      timestamp: "2m ago",
      unread: 2,
      isOnline: true,
      isVoiceActive: false,
      type: "direct",
      avatar: "/avatars/sarah.jpg"
    },
    {
      id: "2",
      name: "Dev Team",
      lastMessage: "Meeting at 3 PM today",
      timestamp: "1h ago",
      unread: 0,
      isOnline: false,
      isVoiceActive: false,
      type: "group",
      avatar: "/groups/dev-team.jpg"
    },
    {
      id: "3",
      name: "Mike Johnson",
      lastMessage: "Thanks for the feedback!",
      timestamp: "3h ago",
      unread: 1,
      isOnline: false,
      isVoiceActive: false,
      type: "direct",
      avatar: "/avatars/mike.jpg"
    }
  ])

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "Hi! How's your project going?",
      sender: "other",
      timestamp: "10:30 AM",
      senderName: "Sarah Chen"
    },
    {
      id: "2",
      content: "It's going great! Just finished the main features.",
      sender: "user",
      timestamp: "10:32 AM"
    },
    {
      id: "3",
      content: "Hey! Want to collaborate on the new project?",
      sender: "other",
      timestamp: "10:35 AM",
      senderName: "Sarah Chen"
    }
  ])

  const activeChat = chats.find(chat => chat.id === activeChatId)

  // Vapi integration for user-to-user voice calls
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
      console.log("Voice transcript:", transcript)
    },
    onCallStart: () => {
      console.log("Voice call started")
    },
    onCallEnd: () => {
      console.log("Voice call ended")
    },
    isActive: activeChat?.isVoiceActive || false,
  })

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, newMessage])

    // Send to Vapi if voice is active
    if (activeChat?.isVoiceActive) {
      sendTextMessage(content)
    }

    // Update chat's last message
    if (activeChatId) {
      setChats(prev => prev.map(chat =>
        chat.id === activeChatId
          ? { ...chat, lastMessage: content, timestamp: "Just now" }
          : chat
      ))
    }
  }

  const handleVoiceToggle = (chatId?: string) => {
    const targetChatId = chatId || activeChatId
    if (!targetChatId) return

    setChats(prev => prev.map(chat =>
      chat.id === targetChatId
        ? { ...chat, isVoiceActive: !chat.isVoiceActive }
        : chat
    ))

    // Update active chat if it matches
    if (activeChatId === targetChatId) {
      const chat = chats.find(c => c.id === targetChatId)
      if (chat?.isVoiceActive) {
        stopCall()
      } else {
        startCall()
      }
    }
  }

  const handleNewChat = () => {
    console.log("Creating new chat...")
  }

  const handleUserSelect = (user: any) => {
    console.log("Selected user:", user)
  }

  const handleStartChat = (userId: string) => {
    const existingChat = chats.find(chat => chat.id === userId)
    if (existingChat) {
      setActiveChatId(existingChat.id)
      setActiveTab("chats")
    } else {
      console.log("Creating new chat with user:", userId)
    }
  }

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col">
      <SiteHeader pageName="Chats" />
      
      <div className="flex-1 flex overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chats" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversations
              </TabsTrigger>
              <TabsTrigger value="discover" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Discover
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chats" className="flex-1 flex m-0 data-[state=active]:flex">
            <div className="flex flex-1 overflow-hidden">
              <ChatSidebar
                chats={chats}
                activeChatId={activeChatId}
                onChatSelect={setActiveChatId}
                onNewChat={handleNewChat}
                onVoiceToggle={handleVoiceToggle}
              />
              
              <div className="flex-1 hidden md:block">
                <ChatMain
                  chat={activeChat || null}
                  messages={activeChatId ? messages : []}
                  onSendMessage={handleSendMessage}
                  onVoiceToggle={() => handleVoiceToggle()}
                />
              </div>

              {/* Mobile view */}
              {activeChatId && (
                <div className="fixed inset-0 z-50 md:hidden bg-background">
                  <ChatMain
                    chat={activeChat || null}
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onVoiceToggle={() => handleVoiceToggle()}
                    onBackToList={() => setActiveChatId(null)}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="discover" className="flex-1 m-0 data-[state=active]:flex">
            <UserDiscovery
              onUserSelect={handleUserSelect}
              onStartChat={handleStartChat}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
