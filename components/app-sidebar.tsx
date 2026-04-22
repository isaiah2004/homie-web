"use client"

import * as React from "react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { Show, useClerk, useUser } from "@clerk/nextjs"
import { useActiveUser } from "@/hooks/use-active-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  Bot,
  Building2Icon,
  ChartBar,
  Folder,
  Users,
  UsersRoundIcon,
  User,
  Camera,
  CalendarDaysIcon,
  FileText,
  Settings2,
  CircleHelp,
  Search,
  Database,
  FileChartColumn,
  File,
  BellDot,
  BellIcon,
  Smile,
  Bell,
  LogOut,
  MessageSquare,
  TicketIcon,
} from "lucide-react"

import Link from "next/link"
const data = {
  navMain: [
    {
      title: "Homie",
      url: "/dashboard/homie",
      icon: <Bot />,
    },
    {
      title: "Friends",
      url: "/dashboard/friends",
      icon: <Users />,
    },
    {
      title: "Chats",
      url: "/dashboard/chats",
      icon: <MessageSquare />,
    },
    {
      title: "Events",
      url: "/dashboard/events",
      icon: <CalendarDaysIcon />,
    },
    {
      title: "Communities",
      url: "/dashboard/communities",
      icon: <UsersRoundIcon />,
    },
    {
      title: "Businesses",
      url: "/dashboard/businesses",
      icon: <Building2Icon />,
    },
    {
      title: "My Coupons",
      url: "/dashboard/my-coupons",
      icon: <TicketIcon />,
    },
    {
      title: "Profile",
      url: "/dashboard/profile",
      icon: <User />,
    },
    {
      title: "Notifications",
      url: "/dashboard/notifications",
      icon: <BellIcon />,
    },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: <Camera />,
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: <FileText />,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: <FileText />,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
  navSecondary: [
    // {
    //   title: "Settings",
    //   url: "#",
    //   icon: <Settings2 />,
    // },
    // {
    //   title: "Get Help",
    //   url: "#",
    //   icon: <CircleHelp />,
    // },
  ],
  // documents: [
  //   {
  //     name: "Data Library",
  //     url: "#",
  //     icon: <Database />,
  //   },
  //   {
  //     name: "Reports",
  //     url: "#",
  //     icon: <FileChartColumn />,
  //   },
  //   {
  //     name: "Word Assistant",
  //     url: "#",
  //     icon: <File />,
  //   },
  // ],
}

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="flex items-center gap-2 data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard" className="flex items-center gap-2">
                <Smile className="size-5!" />
                <span className="ml-1 text-lg font-semibold">Homie</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {/*<NavDocuments items={data.documents} />*/}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {isDevMode ? <DevUserFooter /> : <ClerkUserFooter />}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

// Production footer — Clerk's user object drives the avatar + dropdown.
// Calling `useUser()` / `useClerk()` requires a ClerkProvider ancestor, so
// we guard this subcomponent behind `isDevMode === false` in the parent.
function ClerkUserFooter() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const { isMobile } = useSidebar()

  return (
    <>
      <Show when="signed-in">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
                <AvatarFallback className="rounded-lg">
                  {user?.firstName?.[0] || user?.username?.[0] || user?.emailAddresses?.[0]?.emailAddress[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.username || user?.emailAddresses?.[0]?.emailAddress || "User"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user?.emailAddresses?.[0]?.emailAddress || ""}
                </span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
                  <AvatarFallback className="rounded-lg">
                    {user?.firstName?.[0] || user?.username?.[0] || user?.emailAddresses?.[0]?.emailAddress[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user?.firstName && user?.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user?.username || user?.emailAddresses?.[0]?.emailAddress || "User"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.emailAddresses?.[0]?.emailAddress || ""}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/notifications" className="cursor-pointer">
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
      <Show when="signed-out">
        <SidebarMenuButton size="lg">
          <span className="text-sm text-muted-foreground">Not signed in</span>
        </SidebarMenuButton>
      </Show>
    </>
  )
}

// Dev-mode footer — shows the selected seeded user with a DEV pill. No
// sign-out or avatar image; the floating DevUserSwitcher handles account
// swaps. Never renders <UserButton>, so we don't need a ClerkProvider.
function DevUserFooter() {
  const activeUser = useActiveUser()
  const fallback =
    (activeUser.fullName ?? activeUser.email ?? "U").trim().charAt(0) || "U"

  return (
    <SidebarMenuButton size="lg" className="cursor-default">
      <Avatar className="h-8 w-8 rounded-lg">
        <AvatarFallback className="rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-white">
          {fallback.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium flex items-center gap-1.5">
          {activeUser.fullName ?? "No user"}
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 dark:text-amber-400">
            DEV
          </span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {activeUser.username ? `@${activeUser.username}` : activeUser.email ?? ""}
        </span>
      </div>
    </SidebarMenuButton>
  )
}
