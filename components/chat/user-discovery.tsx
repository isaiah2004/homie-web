"use client"

import { useState } from "react"
import { Search, UserPlus, Users, MapPin, Briefcase, Star, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface User {
  id: string
  name: string
  avatar?: string
  bio: string
  location: string
  profession: string
  skills: string[]
  friendsCount: number
  isFriend: boolean
  isOnline: boolean
  mutualFriends: number
  portfolioUrl?: string
}

interface UserDiscoveryProps {
  onUserSelect: (user: User) => void
  onStartChat: (userId: string) => void
}

export function UserDiscovery({ onUserSelect, onStartChat }: UserDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("all")
  
  // Mock data - replace with actual data from your backend
  const [users] = useState<User[]>([
    {
      id: "1",
      name: "Sarah Chen",
      avatar: "/avatars/sarah.jpg",
      bio: "Full-stack developer passionate about React and TypeScript",
      location: "San Francisco, CA",
      profession: "Software Engineer",
      skills: ["React", "TypeScript", "Node.js"],
      friendsCount: 156,
      isFriend: false,
      isOnline: true,
      mutualFriends: 12,
      portfolioUrl: "https://sarahchen.dev"
    },
    {
      id: "2",
      name: "Mike Johnson",
      avatar: "/avatars/mike.jpg",
      bio: "UI/UX designer creating beautiful digital experiences",
      location: "New York, NY",
      profession: "Product Designer",
      skills: ["Figma", "Design Systems", "Prototyping"],
      friendsCount: 89,
      isFriend: true,
      isOnline: false,
      mutualFriends: 5,
      portfolioUrl: "https://mikej.design"
    },
    {
      id: "3",
      name: "Emily Rodriguez",
      avatar: "/avatars/emily.jpg",
      bio: "Data scientist exploring ML and AI applications",
      location: "Austin, TX",
      profession: "Data Scientist",
      skills: ["Python", "Machine Learning", "TensorFlow"],
      friendsCount: 234,
      isFriend: false,
      isOnline: true,
      mutualFriends: 8,
      portfolioUrl: "https://emilyr.ai"
    }
  ])

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.profession.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesFilter = selectedFilter === "all" ||
                         (selectedFilter === "friends" && user.isFriend) ||
                         (selectedFilter === "online" && user.isOnline) ||
                         (selectedFilter === "suggestions" && !user.isFriend && user.mutualFriends > 0)
    
    return matchesSearch && matchesFilter
  })

  const handleAddFriend = (userId: string) => {
    // Implement friend request logic
    console.log("Adding friend:", userId)
  }

  const UserCard = ({ user }: { user: User }) => (
    <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
          {user.isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-medium">{user.name}</h3>
            <div className="flex items-center gap-1">
              {user.mutualFriends > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {user.mutualFriends} mutual
                </Badge>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
            {user.bio}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {user.profession}
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {user.location}
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {user.friendsCount}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mb-3">
            {user.skills.slice(0, 3).map((skill) => (
              <Badge key={skill} variant="outline" className="text-xs">
                {skill}
              </Badge>
            ))}
            {user.skills.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{user.skills.length - 3}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onStartChat(user.id)}
              className="flex-1"
            >
              Message
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUserSelect(user)}
                >
                  <Star className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{user.name}</DialogTitle>
                  <DialogDescription>
                    View full profile and portfolio
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium">{user.name}</h3>
                      <p className="text-sm text-muted-foreground">{user.profession}</p>
                      <p className="text-xs text-muted-foreground">{user.location}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">About</h4>
                    <p className="text-sm text-muted-foreground">{user.bio}</p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Skills</h4>
                    <div className="flex flex-wrap gap-1">
                      {user.skills.map((skill) => (
                        <Badge key={skill} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {user.portfolioUrl && (
                    <div>
                      <h4 className="font-medium mb-2">Portfolio</h4>
                      <Button variant="outline" asChild className="w-full">
                        <a href={user.portfolioUrl} target="_blank" rel="noopener noreferrer">
                          View Portfolio
                        </a>
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAddFriend(user.id)}
                      disabled={user.isFriend}
                      className="flex-1"
                    >
                      {user.isFriend ? "Already Friends" : "Add Friend"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onStartChat(user.id)}
                      className="flex-1"
                    >
                      Start Chat
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {!user.isFriend && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddFriend(user.id)}
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-3">Discover People</h2>
        
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, profession, or skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={selectedFilter} onValueChange={setSelectedFilter}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="friends">Friends</TabsTrigger>
            <TabsTrigger value="online">Online</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* User List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No users found</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <UserCard key={user.id} user={user} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
