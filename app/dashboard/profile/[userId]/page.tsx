"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon, BriefcaseIcon, FolderGit2Icon, ImageIcon, MapPinIcon,
  MessageCircleIcon, ShieldCheckIcon, SparklesIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"
import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell header={<SiteHeader pageName="Profile" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </PageShell>
  )
}

export default function Page() {
  const activeUser = useActiveUser()
  const params = useParams<{ userId: string }>()
  const targetUserId = params.userId as Id<"users">

  // Resolve viewer's Convex users id. Dev mode uses the switcher value directly;
  // production maps Clerk email → users row via getOrCreateUser.
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [viewerId, setViewerId] = React.useState<Id<"users"> | null>(null)
  const email = activeUser.email ?? undefined
  const username = activeUser.username ?? undefined
  const name = activeUser.fullName ?? undefined
  React.useEffect(() => {
    if (activeUser.isDevMode) { setViewerId(activeUser.devUserId); return }
    if (!email) return
    getOrCreateUser({ email, username, name })
      .then((id) => setViewerId(id as Id<"users">))
      .catch((err) => { console.error(err); toast.error("Failed to sync your account") })
  }, [activeUser.isDevMode, activeUser.devUserId, email, username, name, getOrCreateUser])

  // getUserForViewer filters interests/media/places/projects by visibility
  // server-side against the viewer relationship. getUser is the fallback for
  // "not found" detection before viewerId resolves, plus basic header fields.
  const profile = useQuery(api.users.getUserForViewer,
    viewerId ? { viewerId, targetUserId } : "skip")
  const rawUser = useQuery(api.users.getUser, { userId: targetUserId })
  const relationship = useQuery(api.friends.getRelationship,
    viewerId ? { viewerId, otherUserId: targetUserId } : "skip")

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return <Shell><PickDevUserEmptyState pageName="profile" /></Shell>
  }
  if (rawUser === undefined || (viewerId && profile === undefined)) {
    return <Shell><div className="p-6 text-sm text-muted-foreground">Loading…</div></Shell>
  }
  if (rawUser === null) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-2xl p-6 text-center">
          <div className="rounded-lg border bg-card p-8">
            <h2 className="text-lg font-semibold">User not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">This profile doesn&apos;t exist or was removed.</p>
            <Button asChild className="mt-4"><Link href="/dashboard/friends">Back to friends</Link></Button>
          </div>
        </div>
      </Shell>
    )
  }

  const u = profile ?? rawUser
  const isFriend = relationship === "friend" || relationship === "close" || relationship === "self"
  const interests = profile?.interests ?? []
  const media = profile?.media ?? []
  const places = profile?.places ?? []
  const projects = profile?.projects ?? []

  return (
    <Shell>
      <div className="@container/main mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
        <Button variant="ghost" size="sm" asChild className="mb-3">
          <Link href="/dashboard/friends"><ArrowLeftIcon className="size-4" />Back</Link>
        </Button>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-600 text-3xl font-semibold text-white">
              {initials(u.name)}
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <h2 className="text-2xl font-semibold">{u.name}</h2>
                {/* Lightweight indicator that this account is supervised by a
                    guardian. Intentionally exposes only the fact of
                    supervision — never the guardian names — so the child's
                    family setup isn't broadcast to other users. The flag
                    lives on the users row, populated by family.createChildAccount. */}
                {Boolean(("isChild" in u && u.isChild)) && (
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheckIcon className="size-3" />
                    Supervised
                  </Badge>
                )}
              </div>
              {u.username && <p className="text-sm text-muted-foreground">@{u.username}</p>}
              {u.location && (
                <div className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                  <MapPinIcon className="size-3" />{u.location}
                </div>
              )}
            </div>
            {u.bio && <p className="max-w-prose text-sm text-muted-foreground">{u.bio}</p>}
            {relationship !== "self" && (
              <Button asChild size="sm" disabled={!isFriend} className="mt-2">
                <Link href={`/dashboard/chats?with=${targetUserId}`}>
                  <MessageCircleIcon className="size-4" />Send Message
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {interests.length > 0 && (
          <Section icon={<SparklesIcon className="size-4" />} title="Interests">
            <div className="flex flex-wrap gap-2">
              {interests.map((i, idx) => <Badge key={idx} variant="outline">{i.value}</Badge>)}
            </div>
          </Section>
        )}

        {media.length > 0 && (
          <Section icon={<ImageIcon className="size-4" />} title="Media">
            {media.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {m.title}
                  {m.subtitle && <span className="text-muted-foreground"> — {m.subtitle}</span>}
                </span>
                <Badge variant="secondary" className="shrink-0 capitalize">{m.type}</Badge>
              </div>
            ))}
          </Section>
        )}

        {places.length > 0 && (
          <Section icon={<BriefcaseIcon className="size-4" />} title="Places">
            {places.map((p, idx) => (
              <div key={idx} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="secondary" className="capitalize">{p.type}</Badge>
                </div>
                {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
              </div>
            ))}
          </Section>
        )}

        {projects.length > 0 && (
          <Section icon={<FolderGit2Icon className="size-4" />} title="Projects">
            {projects.map((p, idx) => (
              <div key={idx}>
                <p className="text-sm font-medium">{p.title}</p>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                {p.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>
    </Shell>
  )
}
