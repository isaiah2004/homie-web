"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useQuery } from "convex/react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { SpotifyIntegrationCard } from "@/components/spotify/SpotifyIntegrationCard"
import { SpotifyFeed } from "@/components/spotify/SpotifyFeed"
import { NowPlayingPill } from "@/components/spotify/NowPlayingPill"

// Callback landings pass ?connected=1 or ?error=<code>. We surface the
// outcome as a toast once per mount and then let the live connection query
// drive the rest of the UI.
function useCallbackToast() {
  const params = useSearchParams()
  const connected = params?.get("connected")
  const error = params?.get("error")
  const shownRef = React.useRef(false)
  React.useEffect(() => {
    if (shownRef.current) return
    if (connected === "1") {
      toast.success("Spotify connected")
      shownRef.current = true
    } else if (error) {
      const msg =
        error === "state_mismatch"
          ? "Connection rejected (CSRF check failed). Try again."
          : error === "access_denied"
            ? "You declined the Spotify permissions."
            : `Connection failed: ${error}`
      toast.error(msg)
      shownRef.current = true
    }
  }, [connected, error])
}

export default function Page() {
  useCallbackToast()
  const activeUser = useActiveUser()

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  // Pull the connection once here so the feed/now-playing panels only
  // render after we know it's connected. This avoids a flash of empty
  // "nothing yet" state for unconnected users.
  const connection = useQuery(
    api.spotifyFeed.getMyConnection,
    skip ? "skip" : identityArg,
  )

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Integrations" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="integrations" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell header={<SiteHeader pageName="Integrations" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 md:p-6">
          <div>
            <h1 className="text-xl font-semibold">Integrations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect third-party services to auto-populate parts of your
              profile.
            </p>
          </div>

          <SpotifyIntegrationCard />

          {connection?.isConnected && !connection.needsReauth ? (
            <>
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Now playing
                </h2>
                <div className="mt-2">
                  <NowPlayingPill isSelf />
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Your Spotify feed
                </h2>
                <div className="mt-2">
                  <SpotifyFeed isSelf />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
