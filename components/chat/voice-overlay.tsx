"use client"

import { useMemo } from "react"
import { PhoneOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface VoiceOverlayProps {
  volume: number
  liveTranscript: { user: string; assistant: string }
  activeToolCalls?: string[]
  onEndCall: () => void
  error?: string | null
}

const TOOL_LABELS: Record<string, string> = {
  findFriendPlaces: "Looking up places your friends like…",
  findFriendMedia: "Searching your friends' music and media…",
  findFriendInterests: "Pulling friends' interests…",
  findFriendProjects: "Checking what your friends are building…",
}

const BAR_COUNT = 24

export function VoiceOverlay({
  volume,
  liveTranscript,
  activeToolCalls = [],
  onEndCall,
  error,
}: VoiceOverlayProps) {
  const toolLabel = activeToolCalls.length
    ? TOOL_LABELS[activeToolCalls[0]] ?? "Searching…"
    : null
  // Per-bar phase offset so bars animate out-of-sync, giving a more natural
  // waveform feel rather than a solid block rising and falling together.
  const phases = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => Math.sin(i * 0.7) * 0.3 + 0.7),
    [],
  )

  return (
    <div className="w-full max-w-xl flex flex-col items-center justify-center gap-8 py-10 px-6 bg-gradient-to-b from-background to-muted/40 rounded-xl border">
      <div className="flex items-end gap-1.5 h-24 shrink-0" aria-hidden>
        {phases.map((phase, i) => {
          const h = Math.max(6, Math.min(96, volume * 260 * phase))
          return (
            <div
              key={i}
              className="w-1.5 rounded-full bg-primary transition-all duration-75 ease-out"
              style={{ height: `${h}px` }}
            />
          )
        })}
      </div>

      <div className="w-full min-h-[120px] space-y-3 text-center break-words">
        {liveTranscript.user && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            <span className="font-medium text-foreground">You: </span>
            {liveTranscript.user}
          </p>
        )}
        {liveTranscript.assistant && (
          <p className="text-base leading-relaxed whitespace-pre-wrap">
            <span className="font-medium text-primary">Homie: </span>
            {liveTranscript.assistant}
          </p>
        )}
        {!liveTranscript.user && !liveTranscript.assistant && !toolLabel && (
          <p className="text-sm text-muted-foreground italic">Listening…</p>
        )}
      </div>

      {toolLabel && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{toolLabel}</span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        variant="destructive"
        size="lg"
        onClick={onEndCall}
        className="gap-2 rounded-full"
      >
        <PhoneOff className="h-4 w-4" />
        End call
      </Button>
    </div>
  )
}
