"use client"

import * as React from "react"
import { ChevronDownIcon, Loader2Icon, WrenchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AnnouncementsCard,
  type RecentAnnouncementsOutput,
} from "./announcements-card"
import {
  CommunityListCard,
  type CommunityListOutput,
} from "./community-list-card"
import {
  EventRsvpCard,
  type EventRsvpToolOutput,
} from "./event-rsvp-card"
import {
  FriendOverlapCard,
  type FriendOverlapCardOutput,
} from "./friend-overlap-card"
import {
  FriendsInCommunityCard,
  type FriendsInCommunityOutput,
} from "./friends-in-community-card"
import {
  SearchAnimeCard,
  SearchBooksCard,
  SearchGamesCard,
  SearchMoviesCard,
  SearchSongsCard,
} from "./media-cards"
import {
  SearchPlacesCard,
  type SearchPlacesOutput,
} from "./place-cards"
import {
  UnreadsSummaryCard,
  type UnreadsSummaryOutput,
} from "./unreads-summary-card"
import {
  UpcomingEventsCard,
  type UpcomingEventsOutput,
} from "./upcoming-events-card"
import { parseToolOutput, type PersistedPart } from "./types"

// Small running-tool placeholder. Shown while a tool call is in-flight
// (state === "input-available") so the user sees *something* for each card
// slot before the result arrives.
function RunningTool({ toolName }: { toolName: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed bg-card px-3 py-2 text-xs text-muted-foreground">
      <Loader2Icon className="size-3 animate-spin" />
      <span>Running {toolName}…</span>
    </div>
  )
}

// Final fallback for unknown or malformed tool results. Collapsible so the
// chat stays readable but power users (and we) can still see the raw
// output when debugging.
function FallbackToolCard({
  part,
}: {
  part: PersistedPart
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="rounded-md border bg-card text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="inline-flex items-center gap-2">
          <WrenchIcon className="size-3" />
          <span className="font-medium">
            {part.toolName ?? "tool"} result
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t bg-muted/40 p-2 text-[10px]">
          {part.output ?? part.errorText ?? "(no output)"}
        </pre>
      )}
    </div>
  )
}

// Error state — when `state === "output-error"` or the output JSON can't
// be parsed into the shape we expect.
function ToolErrorCard({
  toolName,
  errorText,
}: {
  toolName: string
  errorText?: string
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      <p className="font-medium">
        {toolName} failed
      </p>
      {errorText && <p className="mt-1 opacity-80">{errorText}</p>}
    </div>
  )
}

export function ToolPartRenderer({
  part,
  className,
}: {
  part: PersistedPart
  className?: string
}) {
  const toolName = part.toolName ?? ""

  if (part.state === "input-available") {
    return (
      <div className={className}>
        <RunningTool toolName={toolName} />
      </div>
    )
  }

  if (part.state === "output-error") {
    return (
      <div className={className}>
        <ToolErrorCard toolName={toolName} errorText={part.errorText} />
      </div>
    )
  }

  // Dispatch on tool name. Adding a new tool? Extend this switch and pair it
  // with the matching card under `components/chat/tool-cards/`.
  switch (toolName) {
    case "findFriendsWithSharedMedia": {
      const data = parseToolOutput<FriendOverlapCardOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <FriendOverlapCard data={data} />
        </div>
      )
    }
    case "findFriendsInCommunity": {
      const data = parseToolOutput<FriendsInCommunityOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <FriendsInCommunityCard data={data} />
        </div>
      )
    }
    case "listMyCommunities":
    case "findCommunityByName": {
      const data = parseToolOutput<CommunityListOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <CommunityListCard
            data={data}
            emptyTitle={
              toolName === "findCommunityByName"
                ? "No matching community"
                : "No communities yet"
            }
            emptyBody={
              toolName === "findCommunityByName"
                ? "None of the communities you're in match that name."
                : "Join or discover some communities to see them here."
            }
          />
        </div>
      )
    }
    case "getEventRsvpSummary": {
      const data = parseToolOutput<EventRsvpToolOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <EventRsvpCard data={data} />
        </div>
      )
    }
    case "listMyUpcomingEvents": {
      const data = parseToolOutput<UpcomingEventsOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <UpcomingEventsCard data={data} />
        </div>
      )
    }
    case "summarizeUnreads": {
      const data = parseToolOutput<UnreadsSummaryOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <UnreadsSummaryCard data={data} />
        </div>
      )
    }
    case "listRecentAnnouncements": {
      const data = parseToolOutput<RecentAnnouncementsOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <AnnouncementsCard data={data} />
        </div>
      )
    }
    case "searchPlaces": {
      const data = parseToolOutput<SearchPlacesOutput>(part.output)
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <SearchPlacesCard data={data} />
        </div>
      )
    }
    case "searchSongs": {
      const data = parseToolOutput<{ query: string; results: unknown[] }>(
        part.output,
      )
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <SearchSongsCard
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data as any}
          />
        </div>
      )
    }
    case "searchMovies": {
      const data = parseToolOutput<{ query: string; results: unknown[] }>(
        part.output,
      )
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <SearchMoviesCard
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data as any}
          />
        </div>
      )
    }
    case "searchBooks": {
      const data = parseToolOutput<{ query: string; results: unknown[] }>(
        part.output,
      )
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <SearchBooksCard
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data as any}
          />
        </div>
      )
    }
    case "searchGames": {
      const data = parseToolOutput<{ query: string; results: unknown[] }>(
        part.output,
      )
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <SearchGamesCard
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data as any}
          />
        </div>
      )
    }
    case "searchAnime": {
      const data = parseToolOutput<{ query: string; results: unknown[] }>(
        part.output,
      )
      if (!data) return <FallbackToolCard part={part} />
      return (
        <div className={className}>
          <SearchAnimeCard
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data as any}
          />
        </div>
      )
    }
    default:
      return (
        <div className={className}>
          <FallbackToolCard part={part} />
        </div>
      )
  }
}

// Renders a full set of parts in order. Convenience wrapper so the chat
// message component can keep its own code simple.
export function ToolPartsList({
  parts,
  textRenderer,
  className,
}: {
  parts: PersistedPart[]
  // Optional custom renderer for "text" parts — lets callers keep their
  // existing Markdown/HTML rendering path instead of a fallback <p>.
  textRenderer?: (text: string, key: string) => React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {parts.map((part, i) => {
        if (part.type === "text" || !part.toolName) {
          const text = part.text ?? ""
          if (!text.trim()) return null
          return (
            <React.Fragment key={`text-${i}`}>
              {textRenderer ? (
                textRenderer(text, `text-${i}`)
              ) : (
                <p className="whitespace-pre-wrap text-sm">{text}</p>
              )}
            </React.Fragment>
          )
        }
        return (
          <ToolPartRenderer
            key={`tool-${part.toolCallId ?? i}`}
            part={part}
          />
        )
      })}
    </div>
  )
}
