"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { SiteHeader } from "@/components/site-header"
import { ChatMain } from "@/components/chat/chat-main"
import { useVapiIntegration } from "@/components/chat/vapi-integration"
import { VoiceOverlay } from "@/components/chat/voice-overlay"
import { VoiceConversation } from "@/components/chat/voice-conversation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageCircle, History, Sparkles, Mic, MicOff, Menu, Trash2, Phone } from "lucide-react"

interface Message {
  id: string
  content: string
  sender: "user" | "other"
  timestamp: string
  senderName?: string
  isVoice?: boolean
  role?: "user" | "assistant" | "system"
}

interface Conversation {
  _id: Id<"conversations">
  title: string | null
  type: "text" | "audio" | "hybrid"
  isActive: boolean
  _creationTime: number
}

export default function Page() {
  const activeUser = useActiveUser()
  const clerkEmail = activeUser.email ?? undefined
  const clerkUsername = activeUser.username ?? undefined
  const clerkName = activeUser.fullName ?? undefined
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | null>(null)
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [isChatThinking, setIsChatThinking] = useState(false)
  // The conversation that owns the live call — transcripts get appended
  // here even if the user clicks away to browse another conversation.
  const activeCallConversationRef = useRef<Id<"conversations"> | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(370)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [convexUserId, setConvexUserId] = useState<Id<"users"> | null>(null)

  // Get or create Convex user from Clerk user
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)

  useEffect(() => {
    // Dev mode skips the Clerk → Convex mapping entirely; the dev switcher
    // already gives us the Convex users id.
    if (activeUser.isDevMode) {
      setConvexUserId(activeUser.devUserId)
      return
    }
    if (clerkEmail) {
      getOrCreateUser({
        email: clerkEmail,
        username: clerkUsername,
        name: clerkName,
      })
        .then((id) => setConvexUserId(id as Id<"users">))
        .catch(console.error)
    }
  }, [
    activeUser.isDevMode,
    activeUser.devUserId,
    clerkEmail,
    clerkUsername,
    clerkName,
    getOrCreateUser,
  ])

  // Fetch conversations from Convex (includes last message preview)
  const conversations = useQuery(api.conversations.getConversationsWithLastMessage,
    convexUserId ? { userId: convexUserId, isActive: true } : "skip"
  )

  // Fetch messages for selected conversation
  const conversationMessages = useQuery(api.conversationMessages.getMessages,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip"
  )

  // Mutations
  const createConversation = useMutation(api.conversations.createConversation)
  const deleteConversation = useMutation(api.conversations.deleteConversation)
  const createMessage = useMutation(api.conversationMessages.createMessage)
  const generateAIResponse = useAction(api.ai.generateAIResponse)

  // Convert Convex messages to UI format
  const messages: Message[] = (conversationMessages || []).map((msg: any) => ({
    id: msg._id,
    content: msg.content || "",
    sender: msg.role === "user" ? "user" : "other",
    senderName: msg.role === "assistant" ? "Homie" : undefined,
    timestamp: new Date(msg._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    role: msg.role
  }))

  // Create new conversation mutation
  const startNewConversation = async () => {
    if (!convexUserId) return
    
    try {
      const newConversationId = await createConversation({
        userId: convexUserId,
        type: "text",
        title: "New Chat"
      })
      setSelectedConversationId(newConversationId)
    } catch (error) {
      console.error("Failed to create conversation:", error)
    }
  }


  // Vapi integration for Homie chatbot
  const vapiConfig = {
    apiKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "",
    assistantId: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID
  }

  const {
    isCallActive,
    error: vapiError,
    volume,
    liveTranscript,
    activeToolCalls,
    startCall,
    stopCall,
    sendTextMessage,
  } = useVapiIntegration({
    config: vapiConfig,
    onTranscript: (transcript, role) => {
      const convId = activeCallConversationRef.current
      if (!convId) return
      createMessage({
        conversationId: convId,
        role,
        content: transcript,
      }).catch((err) =>
        console.error("Failed to save voice transcript:", err),
      )
    },
    onCallStart: () => {
      console.log("Homie voice call started")
    },
    onCallEnd: () => {
      console.log("Homie voice call ended")
      activeCallConversationRef.current = null
      setIsVoiceActive(false)
    },
  })

  const handleSendMessage = async (content: string) => {
    if (!convexUserId) return
    
    // Ensure we have a conversation
    let conversationId = selectedConversationId
    if (!conversationId) {
      try {
        conversationId = await createConversation({
          userId: convexUserId,
          type: isVoiceActive ? "hybrid" : "text",
          title: content.slice(0, 50) || "New Chat"
        })
        setSelectedConversationId(conversationId)
      } catch (error) {
        console.error("Failed to create conversation:", error)
        return
      }
    }

    // Create user message
    try {
      await createMessage({
        conversationId,
        role: "user",
        content
      })
    } catch (error) {
      console.error("Failed to create message:", error)
      return
    }

    // Send to Vapi if voice is active
    if (isVoiceActive) {
      sendTextMessage(content)
    } else {
      setIsChatThinking(true)
      try {
        await generateAIResponse({
          conversationId: conversationId,
          userMessage: content,
        })
      } catch (error) {
        console.error("Failed to generate AI response:", error)
      } finally {
        setIsChatThinking(false)
      }
    }
  }

  const handleHomieResponse = async (response: string) => {
    if (!convexUserId || !selectedConversationId) return
    
    try {
      await createMessage({
        conversationId: selectedConversationId,
        role: "assistant",
        content: response
      })
    } catch (error) {
      console.error("Failed to create assistant message:", error)
    }
  }

  const startNewVoiceCall = async () => {
    if (!convexUserId) return
    try {
      const convId = await createConversation({
        userId: convexUserId,
        type: "audio",
        title: `Voice call ${new Date().toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      })
      activeCallConversationRef.current = convId
      setSelectedConversationId(convId)
      setIsVoiceActive(true)
      await startCall(undefined, { userId: convexUserId })
    } catch (err) {
      console.error("Failed to start voice conversation:", err)
      setIsVoiceActive(false)
    }
  }

  const endCurrentCall = async () => {
    setIsVoiceActive(false)
    await stopCall()
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


  const loadConversation = (conversationId: Id<"conversations">) => {
    setSelectedConversationId(conversationId)
  }

  const handleDeleteConversation = async (
    conversationId: Id<"conversations">,
    e: React.MouseEvent
  ) => {
    e.stopPropagation()
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return

    try {
      await deleteConversation({ conversationId })
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null)
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error)
    }
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
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 h-[65px] gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2 min-w-0">
              <History className="h-5 w-5 shrink-0" />
              <span className="truncate">Conversations</span>
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={startNewConversation}
                size="sm"
                variant="outline"
                className="gap-1"
              >
                <MessageCircle className="h-4 w-4" />
                New Chat
              </Button>
              <Button
                onClick={startNewVoiceCall}
                size="sm"
                className="gap-1"
                disabled={!convexUserId || isCallActive}
              >
                <Phone className="h-4 w-4" />
                New Call
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {conversations === undefined ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                      <Skeleton className="h-3 w-12 shrink-0" />
                    </div>
                  </div>
                ))
              ) : conversations.length > 0 ? (
                conversations.map((conversation: any, index: number) => {
                  const lastMessage = conversation.lastMessage
                  const isAudio = conversation.type === "audio"
                  const TypeIcon = isAudio ? Phone : MessageCircle
                  const placeholder = isAudio ? "Voice call" : "No messages yet"

                  return (
                    <div
                      key={conversation._id}
                      className={`group cursor-pointer rounded-lg border p-3 transition-all hover:bg-muted/50 hover:border-primary/20 animate-in fade-in-0 slide-in-from-top-2 fill-mode-both duration-300 ${
                        selectedConversationId === conversation._id ? "bg-muted/50 border-primary/20" : ""
                      }`}
                      style={{ animationDelay: `${index * 60}ms` }}
                      onClick={() => loadConversation(conversation._id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            isAudio ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate" title={conversation.title || "Untitled"}>
                            {conversation.title || "Untitled"}
                          </h3>
                          <p className="text-sm text-muted-foreground truncate" title={lastMessage?.content || placeholder}>
                            {lastMessage?.content || placeholder}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(conversation._creationTime).toLocaleDateString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDeleteConversation(conversation._id, e)}
                            aria-label="Delete conversation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No conversations yet. Start a new chat!
                </div>
              )}
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
          {(() => {
            const selectedConversation = conversations?.find(
              (c: any) => c._id === selectedConversationId,
            )
            const sidebarToggleBtn = (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            )

            if (isCallActive) {
              return (
                <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                  <VoiceOverlay
                    volume={volume}
                    liveTranscript={liveTranscript}
                    activeToolCalls={activeToolCalls}
                    onEndCall={endCurrentCall}
                    error={vapiError}
                  />
                </div>
              )
            }

            if (selectedConversation?.type === "audio") {
              return (
                <VoiceConversation
                  title={selectedConversation.title || "Voice call"}
                  messages={messages}
                  onStartNewCall={startNewVoiceCall}
                  sidebarToggle={sidebarToggleBtn}
                />
              )
            }

            return (
              <ChatMain
                chat={homieChat}
                messages={messages}
                onSendMessage={handleSendMessage}
                isThinking={isChatThinking}
                sidebarToggle={sidebarToggleBtn}
              />
            )
          })()}

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
