"use client"

import * as React from "react"
import { SiteHeader } from "@/components/site-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  UserPlusIcon,
  MessageCircleIcon,
  CheckIcon,
  XIcon,
  MapPinIcon,
  CalendarIcon,
  StarIcon,
  HeartIcon,
  ShieldIcon,
  SettingsIcon,
  CrownIcon,
} from "lucide-react"

// Mock data types
type Friend = {
  id: string
  name: string
  avatar?: string
  location?: string
  mutualFriends: number
  lastSeen?: string
  status: "online" | "offline" | "away"
  isCloseFriend?: boolean
  closeFriendLevel?: "inner" | "trusted" | "best"
}

type CloseFriendSettings = {
  canSeeLocation: boolean
  canSeeSchedule: boolean
  canSeePrivateContent: boolean
  priorityMessaging: boolean
}

type FriendRequest = {
  id: string
  name: string
  avatar?: string
  mutualFriends: number
  message?: string
  requestedAt: string
}

type Message = {
  id: string
  from: string
  fromAvatar?: string
  content: string
  type: "message" | "question" | "request"
  timestamp: string
  priority: "high" | "medium" | "low"
}

// Mock data
const mockFriends: Friend[] = [
  {
    id: "1",
    name: "Sarah Chen",
    location: "San Francisco, CA",
    mutualFriends: 12,
    lastSeen: "2 hours ago",
    status: "online",
    isCloseFriend: true,
    closeFriendLevel: "best",
  },
  {
    id: "2",
    name: "Mike Johnson",
    location: "New York, NY",
    mutualFriends: 8,
    lastSeen: "1 day ago",
    status: "offline",
    isCloseFriend: true,
    closeFriendLevel: "trusted",
  },
  {
    id: "3",
    name: "Emily Davis",
    location: "Los Angeles, CA",
    mutualFriends: 15,
    lastSeen: "5 minutes ago",
    status: "online",
  },
  {
    id: "4",
    name: "Alex Kim",
    location: "Seattle, WA",
    mutualFriends: 6,
    lastSeen: "3 hours ago",
    status: "away",
  },
]

const mockCloseFriendSettings: CloseFriendSettings = {
  canSeeLocation: true,
  canSeeSchedule: true,
  canSeePrivateContent: false,
  priorityMessaging: true,
}

const mockFriendRequests: FriendRequest[] = [
  {
    id: "1",
    name: "Jordan Taylor",
    mutualFriends: 5,
    message: "Hey! I saw we're both into hiking. Would love to connect!",
    requestedAt: "2 hours ago",
  },
  {
    id: "2",
    name: "Morgan Riley",
    mutualFriends: 3,
    message: "We met at the tech meetup last week!",
    requestedAt: "1 day ago",
  },
]

const mockMessages: Message[] = [
  {
    id: "1",
    from: "Sarah Chen",
    content: "Hey! Are you free this weekend for coffee?",
    type: "message",
    timestamp: "1 hour ago",
    priority: "medium",
  },
  {
    id: "2",
    from: "Mike Johnson",
    content: "Do you have any recommendations for good restaurants in downtown?",
    type: "question",
    timestamp: "3 hours ago",
    priority: "low",
  },
  {
    id: "3",
    from: "Emily Davis",
    content: "Can you help me with the project we discussed? It's quite urgent!",
    type: "request",
    timestamp: "5 hours ago",
    priority: "high",
  },
]

// Status indicator component
function StatusIndicator({ status }: { status: Friend["status"] }) {
  const statusColors = {
    online: "bg-green-500",
    offline: "bg-gray-400",
    away: "bg-yellow-500",
  }

  return (
    <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
  )
}

// Priority badge component
function PriorityBadge({ priority }: { priority: Message["priority"] }) {
  const priorityConfig = {
    high: { label: "Urgent", className: "bg-red-100 text-red-800 border-red-200" },
    medium: { label: "Normal", className: "bg-blue-100 text-blue-800 border-blue-200" },
    low: { label: "Low", className: "bg-gray-100 text-gray-800 border-gray-200" },
  }

  const config = priorityConfig[priority]

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

// Message type icon component
function MessageTypeIcon({ type }: { type: Message["type"] }) {
  const icons = {
    message: <MessageCircleIcon className="size-4" />,
    question: <StarIcon className="size-4" />,
    request: <UserPlusIcon className="size-4" />,
  }

  return icons[type]
}

// Close friend level badge component
function CloseFriendLevelBadge({ level }: { level?: Friend["closeFriendLevel"] }) {
  if (!level) return null

  const levelConfig = {
    inner: { label: "Inner", className: "bg-purple-100 text-purple-800 border-purple-200", icon: <HeartIcon className="size-3" /> },
    trusted: { label: "Trusted", className: "bg-blue-100 text-blue-800 border-blue-200", icon: <ShieldIcon className="size-3" /> },
    best: { label: "Best", className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <CrownIcon className="size-3" /> },
  }

  const config = levelConfig[level]

  return (
    <Badge variant="outline" className={config.className}>
      <span className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </span>
    </Badge>
  )
}

export default function Page() {
  const [friends, setFriends] = React.useState<Friend[]>(mockFriends)
  const [friendRequests, setFriendRequests] = React.useState<FriendRequest[]>(mockFriendRequests)
  const [messages, setMessages] = React.useState<Message[]>(mockMessages)
  const [closeFriendSettings, setCloseFriendSettings] = React.useState<CloseFriendSettings>(mockCloseFriendSettings)
  const [showAddCloseFriend, setShowAddCloseFriend] = React.useState(false)

  const handleAcceptRequest = (requestId: string) => {
    const request = friendRequests.find(r => r.id === requestId)
    if (request) {
      // Add to friends list
      const newFriend: Friend = {
        id: Date.now().toString(),
        name: request.name,
        mutualFriends: request.mutualFriends,
        status: "offline",
      }
      setFriends(prev => [...prev, newFriend])
      // Remove from requests
      setFriendRequests(prev => prev.filter(r => r.id !== requestId))
    }
  }

  const handleDeclineRequest = (requestId: string) => {
    setFriendRequests(prev => prev.filter(r => r.id !== requestId))
  }

  const handleMarkMessageAsRead = (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  const handleAddCloseFriend = (friendId: string, level: Friend["closeFriendLevel"]) => {
    setFriends(prev => prev.map(friend => 
      friend.id === friendId 
        ? { ...friend, isCloseFriend: true, closeFriendLevel: level }
        : friend
    ))
    setShowAddCloseFriend(false)
  }

  const handleRemoveCloseFriend = (friendId: string) => {
    setFriends(prev => prev.map(friend => 
      friend.id === friendId 
        ? { ...friend, isCloseFriend: false, closeFriendLevel: undefined }
        : friend
    ))
  }

  const handleUpdateCloseFriendLevel = (friendId: string, level: Friend["closeFriendLevel"]) => {
    setFriends(prev => prev.map(friend => 
      friend.id === friendId 
        ? { ...friend, closeFriendLevel: level }
        : friend
    ))
  }

  const handleUpdateCloseFriendSettings = (setting: keyof CloseFriendSettings, value: boolean) => {
    setCloseFriendSettings(prev => ({ ...prev, [setting]: value }))
  }

  return (
    <div>
      <SiteHeader pageName="Friends" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
              <div className="absolute inset-0 opacity-10 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697072_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Friends</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{friends.length}</p>
                  </div>
                  <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-lg">
                    <UserPlusIcon className="size-5 text-blue-700 dark:text-blue-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
              <div className="absolute inset-0 opacity-10 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697073_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">Pending Requests</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">{friendRequests.length}</p>
                  </div>
                  <div className="p-2 bg-green-200 dark:bg-green-800 rounded-lg">
                    <UserPlusIcon className="size-5 text-green-700 dark:text-green-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
              <div className="absolute inset-0 opacity-10 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-rail-2721626_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Unread Messages</p>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{messages.length}</p>
                  </div>
                  <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-lg">
                    <MessageCircleIcon className="size-5 text-purple-700 dark:text-purple-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Close Friends Management */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Close Friends List */}
            <Card className="lg:col-span-2 relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697072_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <HeartIcon className="size-5" />
                    Close Friends
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddCloseFriend(!showAddCloseFriend)}
                  >
                    <UserPlusIcon className="size-4 mr-1" />
                    Add
                  </Button>
                </div>
                <CardDescription>
                  Your inner circle with special privileges
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-3">
                  {friends.filter(f => f.isCloseFriend).length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No close friends yet</p>
                  ) : (
                    friends.filter(f => f.isCloseFriend).map((friend) => (
                      <div
                        key={friend.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-red-600 flex items-center justify-center text-white font-semibold">
                              {friend.name.split(" ").map(n => n[0]).join("")}
                            </div>
                            <div className="absolute -bottom-1 -right-1">
                              <StatusIndicator status={friend.status} />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium">{friend.name}</p>
                              <CloseFriendLevelBadge level={friend.closeFriendLevel} />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {friend.location && (
                                <span className="flex items-center gap-1">
                                  <MapPinIcon className="size-3" />
                                  {friend.location}
                                </span>
                              )}
                              <span>•</span>
                              <span>{friend.mutualFriends} mutual friends</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={friend.closeFriendLevel || ""}
                            onChange={(e) => handleUpdateCloseFriendLevel(friend.id, e.target.value as Friend["closeFriendLevel"])}
                            className="text-xs border rounded px-2 py-1 bg-background"
                          >
                            <option value="">Level</option>
                            <option value="inner">Inner</option>
                            <option value="trusted">Trusted</option>
                            <option value="best">Best</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveCloseFriend(friend.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <XIcon className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Close Friend Section */}
                {showAddCloseFriend && (
                  <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                    <h4 className="font-medium mb-3">Add Close Friend</h4>
                    <div className="space-y-2">
                      {friends.filter(f => !f.isCloseFriend).map((friend) => (
                        <div key={friend.id} className="flex items-center justify-between p-2 rounded border bg-background">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                              {friend.name.split(" ").map(n => n[0]).join("")}
                            </div>
                            <span className="text-sm">{friend.name}</span>
                          </div>
                          <div className="flex gap-2">
                            <select
                              className="text-xs border rounded px-2 py-1 bg-background"
                              onChange={(e) => e.target.value && handleAddCloseFriend(friend.id, e.target.value as Friend["closeFriendLevel"])}
                              defaultValue=""
                            >
                              <option value="" disabled>Select level</option>
                              <option value="inner">Inner</option>
                              <option value="trusted">Trusted</option>
                              <option value="best">Best</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Close Friend Settings */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697073_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="size-5" />
                  Privacy Settings
                </CardTitle>
                <CardDescription>
                  Control what close friends can see
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPinIcon className="size-4" />
                      <span className="text-sm">Location Sharing</span>
                    </div>
                    <Button
                      variant={closeFriendSettings.canSeeLocation ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleUpdateCloseFriendSettings("canSeeLocation", !closeFriendSettings.canSeeLocation)}
                    >
                      {closeFriendSettings.canSeeLocation ? "On" : "Off"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="size-4" />
                      <span className="text-sm">Schedule Access</span>
                    </div>
                    <Button
                      variant={closeFriendSettings.canSeeSchedule ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleUpdateCloseFriendSettings("canSeeSchedule", !closeFriendSettings.canSeeSchedule)}
                    >
                      {closeFriendSettings.canSeeSchedule ? "On" : "Off"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldIcon className="size-4" />
                      <span className="text-sm">Private Content</span>
                    </div>
                    <Button
                      variant={closeFriendSettings.canSeePrivateContent ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleUpdateCloseFriendSettings("canSeePrivateContent", !closeFriendSettings.canSeePrivateContent)}
                    >
                      {closeFriendSettings.canSeePrivateContent ? "On" : "Off"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StarIcon className="size-4" />
                      <span className="text-sm">Priority Messages</span>
                    </div>
                    <Button
                      variant={closeFriendSettings.priorityMessaging ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleUpdateCloseFriendSettings("priorityMessaging", !closeFriendSettings.priorityMessaging)}
                    >
                      {closeFriendSettings.priorityMessaging ? "On" : "Off"}
                    </Button>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Close Friend Levels</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <HeartIcon className="size-3" />
                      <span><strong>Inner:</strong> Basic close friend privileges</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldIcon className="size-3" />
                      <span><strong>Trusted:</strong> Extended access and features</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CrownIcon className="size-3" />
                      <span><strong>Best:</strong> Maximum privileges and priority</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Friends List */}
            <Card className="lg:col-span-2 relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697072_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2">
                  <UserPlusIcon className="size-5" />
                  Your Friends
                </CardTitle>
                <CardDescription>
                  Connect and interact with your friends
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold">
                            {friend.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div className="absolute -bottom-1 -right-1">
                            <StatusIndicator status={friend.status} />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{friend.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {friend.location && (
                              <span className="flex items-center gap-1">
                                <MapPinIcon className="size-3" />
                                {friend.location}
                              </span>
                            )}
                            <span>•</span>
                            <span>{friend.mutualFriends} mutual friends</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{friend.lastSeen}</span>
                        <Button variant="outline" size="sm">
                          <MessageCircleIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Friend Requests */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 mix-blend-overlay">
                <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697073_1920.png)', backgroundSize: '300px 300px' }} />
              </div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2">
                  <UserPlusIcon className="size-5" />
                  Friend Requests
                </CardTitle>
                <CardDescription>
                  People who want to connect with you
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-3">
                  {friendRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No pending requests</p>
                  ) : (
                    friendRequests.map((request) => (
                      <div
                        key={request.id}
                        className="p-3 rounded-lg border bg-card space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                            {request.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{request.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {request.mutualFriends} mutual friends • {request.requestedAt}
                            </p>
                          </div>
                        </div>
                        {request.message && (
                          <p className="text-sm text-muted-foreground italic">
                            "{request.message}"
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleAcceptRequest(request.id)}
                          >
                            <CheckIcon className="size-3 mr-1" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleDeclineRequest(request.id)}
                          >
                            <XIcon className="size-3 mr-1" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Messages & Requests */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 mix-blend-overlay">
              <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-rail-2721626_1920.png)', backgroundSize: '300px 300px' }} />
            </div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2">
                <MessageCircleIcon className="size-5" />
                Messages & Requests
              </CardTitle>
              <CardDescription>
                Recent messages, questions, and requests from your friends
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No new messages</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <MessageTypeIcon type={message.type} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{message.from}</p>
                            <PriorityBadge priority={message.priority} />
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {message.content}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CalendarIcon className="size-3" />
                            {message.timestamp}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkMessageAsRead(message.id)}
                        >
                          Mark as read
                        </Button>
                        <Button size="sm">
                          Reply
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
