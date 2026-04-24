"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  LinkIcon,
  UnlinkIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import {
  useIdentifiedAction,
  useIdentifiedMutation,
} from "@/hooks/use-identified"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

// Top-level control surface for the Spotify integration. Three states:
//   1. Not connected            → Connect button.
//   2. Connected                → Status summary + Sync / Disconnect.
//   3. Connected but reauth req → Reconnect banner; Sync disabled.
//
// The "Connect" button links directly to the /api/spotify/connect route —
// we do NOT use a client-side Convex action here because the redirect to
// Spotify has to happen from a top-level navigation (so cookies stick).

function timeAgo(t: number | undefined): string {
  if (!t) return "never"
  const diff = Date.now() - t
  if (diff < 60_000) return "just now"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function SpotifyIntegrationCard() {
  const activeUser = useActiveUser()
  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const connection = useQuery(
    api.spotifyFeed.getMyConnection,
    skip ? "skip" : identityArg,
  )
  const syncAll = useIdentifiedAction(api.spotifySync.syncAll)
  const disconnect = useIdentifiedMutation(api.spotifyOAuth.disconnect)

  const [isSyncing, setIsSyncing] = React.useState(false)
  const [isDisconnecting, setIsDisconnecting] = React.useState(false)

  const connectHref = activeUser.isDevMode && activeUser.devUserId
    ? `/api/spotify/connect?devUserId=${activeUser.devUserId}`
    : `/api/spotify/connect`

  const runSync = async () => {
    setIsSyncing(true)
    try {
      await syncAll({})
      toast.success("Spotify synced")
    } catch (e) {
      const msg = (e as Error).message
      toast.error(
        msg.includes("reauth_required")
          ? "Reconnect Spotify — permission was revoked."
          : `Sync failed: ${msg}`,
      )
    } finally {
      setIsSyncing(false)
    }
  }

  const runDisconnect = async () => {
    if (!confirm("Disconnect Spotify? This removes all synced songs.")) return
    setIsDisconnecting(true)
    try {
      await disconnect({})
      toast.success("Spotify disconnected")
    } catch (e) {
      toast.error(`Disconnect failed: ${(e as Error).message}`)
    } finally {
      setIsDisconnecting(false)
    }
  }

  if (connection === undefined) {
    return (
      <div className="rounded-xl border p-6">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  // Not connected
  if (!connection.isConnected) {
    return (
      <div className="rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Spotify</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your Spotify to show what you like, what you&apos;re
              playing right now, and your top tracks on your profile.
            </p>
          </div>
          <Button asChild>
            <a href={connectHref}>
              <LinkIcon className="size-4" /> Connect
            </a>
          </Button>
        </div>
      </div>
    )
  }

  const needsReauth = connection.needsReauth

  return (
    <div className="rounded-xl border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold">Spotify</div>
            {needsReauth ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangleIcon className="size-3" /> Reconnect needed
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <CheckCircleIcon className="size-3" /> Connected
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Spotify user{" "}
            <span className="font-mono">{connection.spotifyUserId}</span>
            {" · "}
            linked {timeAgo(connection.connectedAt)}.
          </p>
        </div>
        <div className="flex gap-2">
          {needsReauth ? (
            <Button asChild>
              <a href={connectHref}>
                <LinkIcon className="size-4" /> Reconnect
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={runSync}
              disabled={isSyncing}
            >
              <RefreshCwIcon
                className={`size-4 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "Syncing…" : "Sync now"}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={runDisconnect}
            disabled={isDisconnecting}
          >
            <UnlinkIcon className="size-4" />
            Disconnect
          </Button>
        </div>
      </div>
      <Separator className="my-4" />
      <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Liked</dt>
          <dd>{timeAgo(connection.lastLikedSyncAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Recent</dt>
          <dd>{timeAgo(connection.lastRecentSyncAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Top</dt>
          <dd>{timeAgo(connection.lastTopSyncAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Now playing</dt>
          <dd>{timeAgo(connection.lastNowPlayingAt)}</dd>
        </div>
      </dl>
    </div>
  )
}
