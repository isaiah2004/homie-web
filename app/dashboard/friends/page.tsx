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
  UsersIcon,
  ClockIcon,
  SearchIcon,
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

// Texture overlay component for consistent usage
function TextureOverlay({
  texture = "mesh1",
  opacity = "opacity-[0.04]",
}: {
  texture?: "mesh1" | "mesh2" | "rail"
  opacity?: string
}) {
  const texturePaths = {
    mesh1: "/images/textures/davidzydd-mesh-2697072_1920.png",
    mesh2: "/images/textures/davidzydd-mesh-2697073_1920.png",
    rail: "/images/textures/davidzydd-rail-2721626_1920.png",
  }

  return (
    <div className={`absolute inset-0 ${opacity} mix-blend-overlay pointer-events-none`}>
      <div
        className="w-full h-full bg-repeat bg-center"
        style={{
          backgroundImage: `url(${texturePaths[texture]})`,
          backgroundSize: "400px 400px",
        }}
      />
    </div>
  )
}

// Status indicator component
function StatusIndicator({
  status,
  size = "sm",
}: {
  status: Friend["status"]
  size?: "sm" | "md"
}) {
  const statusColors = {
    online: "bg-emerald-500 shadow-emerald-500/50",
    offline: "bg-gray-400",
    away: "bg-amber-400 shadow-amber-400/50",
  }

  const sizeClasses = {
    sm: "w-2.5 h-2.5",
    md: "w-3 h-3",
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full ${statusColors[status]} ${status !== "offline" ? "shadow-sm" : ""} ring-2 ring-background`}
    />
  )
}

// Priority badge component
function PriorityBadge({ priority }: { priority: Message["priority"] }) {
  const priorityConfig = {
    high: {
      label: "Urgent",
      className:
        "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    },
    medium: {
      label: "Normal",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    },
    low: {
      label: "Low",
      className:
        "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
    },
  }

  const config = priorityConfig[priority]

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.className}`}>
      {config.label}
    </Badge>
  )
}

// Message type icon component
function MessageTypeIcon({ type }: { type: Message["type"] }) {
  const config = {
    message: {
      icon: <MessageCircleIcon className="size-4" />,
      bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    question: {
      icon: <StarIcon className="size-4" />,
      bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    request: {
      icon: <UserPlusIcon className="size-4" />,
      bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
  }

  const c = config[type]

  return (
    <div className={`p-2 rounded-lg ${c.bg}`}>
      {c.icon}
    </div>
  )
}

// Close friend level badge component
function CloseFriendLevelBadge({
  level,
}: {
  level?: Friend["closeFriendLevel"]
}) {
  if (!level) return null

  const levelConfig = {
    inner: {
      label: "Inner",
      className:
        "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
      icon: <HeartIcon className="size-3" />,
    },
    trusted: {
      label: "Trusted",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      icon: <ShieldIcon className="size-3" />,
    },
    best: {
      label: "Best",
      className:
        "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
      icon: <CrownIcon className="size-3" />,
    },
  }

  const config = levelConfig[level]

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.className}`}>
      <span className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </span>
    </Badge>
  )
}

// Avatar with initials
function Avatar({
  name,
  gradient = "from-blue-400 to-purple-600",
  size = "md",
}: {
  name: string
  gradient?: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold shrink-0`}
    >
      {name
        .split(" ")
        .map((n) => n[0])
        .join("")}
    </div>
  )
}

export default function Page() {
  const [friends, setFriends] = React.useState<Friend[]>(mockFriends)
  const [friendRequests, setFriendRequests] =
    React.useState<FriendRequest[]>(mockFriendRequests)
  const [messages, setMessages] = React.useState<Message[]>(mockMessages)
  const [closeFriendSettings, setCloseFriendSettings] =
    React.useState<CloseFriendSettings>(mockCloseFriendSettings)
  const [showAddCloseFriend, setShowAddCloseFriend] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  const handleAcceptRequest = (requestId: string) => {
    const request = friendRequests.find((r) => r.id === requestId)
    if (request) {
      const newFriend: Friend = {
        id: Date.now().toString(),
        name: request.name,
        mutualFriends: request.mutualFriends,
        status: "offline",
      }
      setFriends((prev) => [...prev, newFriend])
      setFriendRequests((prev) => prev.filter((r) => r.id !== requestId))
    }
  }

  const handleDeclineRequest = (requestId: string) => {
    setFriendRequests((prev) => prev.filter((r) => r.id !== requestId))
  }

  const handleMarkMessageAsRead = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }

  const handleAddCloseFriend = (
    friendId: string,
    level: Friend["closeFriendLevel"]
  ) => {
    setFriends((prev) =>
      prev.map((friend) =>
        friend.id === friendId
          ? { ...friend, isCloseFriend: true, closeFriendLevel: level }
          : friend
      )
    )
    setShowAddCloseFriend(false)
  }

  const handleRemoveCloseFriend = (friendId: string) => {
    setFriends((prev) =>
      prev.map((friend) =>
        friend.id === friendId
          ? { ...friend, isCloseFriend: false, closeFriendLevel: undefined }
          : friend
      )
    )
  }

  const handleUpdateCloseFriendLevel = (
    friendId: string,
    level: Friend["closeFriendLevel"]
  ) => {
    setFriends((prev) =>
      prev.map((friend) =>
        friend.id === friendId ? { ...friend, closeFriendLevel: level } : friend
      )
    )
  }

  const handleUpdateCloseFriendSettings = (
    setting: keyof CloseFriendSettings,
    value: boolean
  ) => {
    setCloseFriendSettings((prev) => ({ ...prev, [setting]: value }))
  }

  const filteredFriends = searchQuery
    ? friends.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : friends

  return (
    <div>
      <SiteHeader pageName="Friends" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100/80 dark:from-blue-950/80 dark:to-blue-900/60 border-blue-200/60 dark:border-blue-800/60">
              <TextureOverlay texture="mesh1" opacity="opacity-[0.08]" />
              <CardContent className="relative p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-blue-600/80 dark:text-blue-400/80">
                      Total Friends
                    </p>
                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                      {friends.length}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-500/10 dark:bg-blue-400/10 rounded-xl">
                    <UsersIcon className="size-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100/80 dark:from-amber-950/80 dark:to-orange-900/60 border-amber-200/60 dark:border-amber-800/60">
              <TextureOverlay texture="mesh2" opacity="opacity-[0.08]" />
              <CardContent className="relative p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">
                      Pending Requests
                    </p>
                    <p className="text-3xl font-bold text-amber-900 dark:text-amber-100 mt-1">
                      {friendRequests.length}
                    </p>
                  </div>
                  <div className="p-3 bg-amber-500/10 dark:bg-amber-400/10 rounded-xl">
                    <UserPlusIcon className="size-6 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100/80 dark:from-purple-950/80 dark:to-purple-900/60 border-purple-200/60 dark:border-purple-800/60">
              <TextureOverlay texture="rail" opacity="opacity-[0.08]" />
              <CardContent className="relative p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-purple-600/80 dark:text-purple-400/80">
                      Unread Messages
                    </p>
                    <p className="text-3xl font-bold text-purple-900 dark:text-purple-100 mt-1">
                      {messages.length}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-400/10 rounded-xl">
                    <MessageCircleIcon className="size-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Friends List + Friend Requests side by side */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Friends List — takes more space */}
            <Card className="lg:col-span-3 relative overflow-hidden">
              <TextureOverlay texture="mesh1" opacity="opacity-[0.03]" />
              <CardHeader className="relative pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <UsersIcon className="size-5" />
                    Your Friends
                  </CardTitle>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {friends.length}
                  </Badge>
                </div>
                <div className="relative mt-2">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search friends..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60"
                  />
                </div>
              </CardHeader>
              <CardContent className="relative pt-0">
                <div className="space-y-2">
                  {filteredFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="group flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/60 hover:border-border transition-all"
                    >
                      <div className="relative">
                        <Avatar
                          name={friend.name}
                          gradient="from-blue-400 to-purple-600"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <StatusIndicator status={friend.status} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {friend.name}
                          </p>
                          {friend.isCloseFriend && (
                            <CloseFriendLevelBadge
                              level={friend.closeFriendLevel}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {friend.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPinIcon className="size-3 shrink-0" />
                              {friend.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1 shrink-0">
                            <UsersIcon className="size-3" />
                            {friend.mutualFriends}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground/70 hidden sm:inline-flex items-center gap-1">
                          <ClockIcon className="size-3" />
                          {friend.lastSeen}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                        >
                          <MessageCircleIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Friend Requests — clear visual distinction */}
            <Card className="lg:col-span-2 relative overflow-hidden border-amber-200/40 dark:border-amber-800/30">
              <TextureOverlay texture="mesh2" opacity="opacity-[0.04]" />
              <CardHeader className="relative pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <UserPlusIcon className="size-5 text-amber-600 dark:text-amber-400" />
                    Requests
                  </CardTitle>
                  {friendRequests.length > 0 && (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-mono">
                      {friendRequests.length}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  People who want to connect with you
                </CardDescription>
              </CardHeader>
              <CardContent className="relative pt-0">
                <div className="space-y-3">
                  {friendRequests.length === 0 ? (
                    <div className="text-center py-8">
                      <UserPlusIcon className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No pending requests
                      </p>
                    </div>
                  ) : (
                    friendRequests.map((request) => (
                      <div
                        key={request.id}
                        className="p-4 rounded-xl border border-amber-200/40 dark:border-amber-800/30 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/30 dark:to-orange-950/20 space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            name={request.name}
                            gradient="from-amber-400 to-orange-600"
                            size="lg"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">
                              {request.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <UsersIcon className="size-3" />
                                {request.mutualFriends} mutual
                              </span>
                              <span className="text-muted-foreground/40">
                                ·
                              </span>
                              <span className="flex items-center gap-1">
                                <ClockIcon className="size-3" />
                                {request.requestedAt}
                              </span>
                            </div>
                          </div>
                        </div>
                        {request.message && (
                          <div className="px-3 py-2 rounded-lg bg-background/60 border border-border/30">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              &ldquo;{request.message}&rdquo;
                            </p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleAcceptRequest(request.id)}
                          >
                            <CheckIcon className="size-3.5 mr-1" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => handleDeclineRequest(request.id)}
                          >
                            <XIcon className="size-3.5 mr-1" />
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

          {/* Close Friends + Settings */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Close Friends List */}
            <Card className="lg:col-span-3 relative overflow-hidden">
              <TextureOverlay texture="rail" opacity="opacity-[0.03]" />
              <CardHeader className="relative pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <HeartIcon className="size-5 text-pink-500" />
                    Close Friends
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setShowAddCloseFriend(!showAddCloseFriend)}
                  >
                    <UserPlusIcon className="size-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  Your inner circle with special privileges
                </CardDescription>
              </CardHeader>
              <CardContent className="relative pt-0">
                <div className="space-y-2">
                  {friends.filter((f) => f.isCloseFriend).length === 0 ? (
                    <div className="text-center py-8">
                      <HeartIcon className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No close friends yet
                      </p>
                    </div>
                  ) : (
                    friends
                      .filter((f) => f.isCloseFriend)
                      .map((friend) => (
                        <div
                          key={friend.id}
                          className="group flex items-center gap-3 p-3 rounded-xl border border-pink-200/30 dark:border-pink-800/20 bg-gradient-to-r from-pink-50/30 to-transparent dark:from-pink-950/20 dark:to-transparent hover:from-pink-50/50 dark:hover:from-pink-950/30 transition-all"
                        >
                          <div className="relative">
                            <Avatar
                              name={friend.name}
                              gradient="from-pink-400 to-rose-600"
                            />
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <StatusIndicator status={friend.status} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">
                                {friend.name}
                              </p>
                              <CloseFriendLevelBadge
                                level={friend.closeFriendLevel}
                              />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              {friend.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPinIcon className="size-3 shrink-0" />
                                  {friend.location}
                                </span>
                              )}
                              <span className="flex items-center gap-1 shrink-0">
                                <UsersIcon className="size-3" />
                                {friend.mutualFriends}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <select
                              value={friend.closeFriendLevel || ""}
                              onChange={(e) =>
                                handleUpdateCloseFriendLevel(
                                  friend.id,
                                  e.target.value as Friend["closeFriendLevel"]
                                )
                              }
                              className="text-xs border border-border/60 rounded-md px-2 py-1 bg-background/80 focus:outline-none focus:ring-2 focus:ring-ring/30"
                            >
                              <option value="">Level</option>
                              <option value="inner">Inner</option>
                              <option value="trusted">Trusted</option>
                              <option value="best">Best</option>
                            </select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveCloseFriend(friend.id)
                              }
                              className="text-destructive/60 hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <XIcon className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                  )}
                </div>

                {/* Add Close Friend Section */}
                {showAddCloseFriend && (
                  <div className="mt-4 p-4 border border-dashed border-border/60 rounded-xl bg-muted/30">
                    <h4 className="font-medium text-sm mb-3">
                      Add Close Friend
                    </h4>
                    <div className="space-y-2">
                      {friends
                        .filter((f) => !f.isCloseFriend)
                        .map((friend) => (
                          <div
                            key={friend.id}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-background/80"
                          >
                            <div className="flex items-center gap-2.5">
                              <Avatar
                                name={friend.name}
                                gradient="from-blue-400 to-purple-600"
                                size="sm"
                              />
                              <span className="text-sm">{friend.name}</span>
                            </div>
                            <select
                              className="text-xs border border-border/60 rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
                              onChange={(e) =>
                                e.target.value &&
                                handleAddCloseFriend(
                                  friend.id,
                                  e.target.value as Friend["closeFriendLevel"]
                                )
                              }
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Select level
                              </option>
                              <option value="inner">Inner</option>
                              <option value="trusted">Trusted</option>
                              <option value="best">Best</option>
                            </select>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Close Friend Settings */}
            <Card className="lg:col-span-2 relative overflow-hidden">
              <TextureOverlay texture="mesh2" opacity="opacity-[0.03]" />
              <CardHeader className="relative pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <SettingsIcon className="size-5" />
                  Privacy Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Control what close friends can see
                </CardDescription>
              </CardHeader>
              <CardContent className="relative pt-0">
                <div className="space-y-3">
                  {(
                    [
                      {
                        key: "canSeeLocation" as const,
                        icon: MapPinIcon,
                        label: "Location Sharing",
                      },
                      {
                        key: "canSeeSchedule" as const,
                        icon: CalendarIcon,
                        label: "Schedule Access",
                      },
                      {
                        key: "canSeePrivateContent" as const,
                        icon: ShieldIcon,
                        label: "Private Content",
                      },
                      {
                        key: "priorityMessaging" as const,
                        icon: StarIcon,
                        label: "Priority Messages",
                      },
                    ] as const
                  ).map(({ key, icon: Icon, label }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-muted/60">
                          <Icon className="size-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm">{label}</span>
                      </div>
                      <button
                        onClick={() =>
                          handleUpdateCloseFriendSettings(
                            key,
                            !closeFriendSettings[key]
                          )
                        }
                        className={`relative w-10 h-5.5 rounded-full transition-colors ${
                          closeFriendSettings[key]
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/20"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${
                            closeFriendSettings[key]
                              ? "translate-x-5"
                              : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                <div className="space-y-2.5">
                  <h4 className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
                    Friend Levels
                  </h4>
                  <div className="space-y-2">
                    {[
                      {
                        icon: HeartIcon,
                        color: "text-purple-500",
                        name: "Inner",
                        desc: "Basic close friend privileges",
                      },
                      {
                        icon: ShieldIcon,
                        color: "text-blue-500",
                        name: "Trusted",
                        desc: "Extended access and features",
                      },
                      {
                        icon: CrownIcon,
                        color: "text-amber-500",
                        name: "Best",
                        desc: "Maximum privileges and priority",
                      },
                    ].map(({ icon: Icon, color, name, desc }) => (
                      <div
                        key={name}
                        className="flex items-center gap-2.5 text-xs"
                      >
                        <Icon className={`size-3.5 ${color} shrink-0`} />
                        <span>
                          <strong>{name}:</strong>{" "}
                          <span className="text-muted-foreground">{desc}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Messages & Requests */}
          <Card className="relative overflow-hidden">
            <TextureOverlay texture="rail" opacity="opacity-[0.03]" />
            <CardHeader className="relative pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageCircleIcon className="size-5" />
                  Messages & Requests
                </CardTitle>
                {messages.length > 0 && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {messages.length} new
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Recent messages, questions, and requests from your friends
              </CardDescription>
            </CardHeader>
            <CardContent className="relative pt-0">
              <div className="space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircleIcon className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No new messages
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="group flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/40 hover:border-border transition-all"
                    >
                      <MessageTypeIcon type={message.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm">{message.from}</p>
                          <PriorityBadge priority={message.priority} />
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {message.content}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mt-1.5">
                          <ClockIcon className="size-3" />
                          {message.timestamp}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => handleMarkMessageAsRead(message.id)}
                        >
                          Read
                        </Button>
                        <Button size="sm" className="h-7 text-xs px-3">
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
