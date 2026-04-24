"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  ExternalLinkIcon,
  InfoIcon,
  Loader2Icon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useIdentifiedAction } from "@/hooks/use-identified"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type PlaceType =
  | "restaurant"
  | "cafe"
  | "bar"
  | "park"
  | "gym"
  | "library"
  | "store"
  | "hangout"
  | "other"

type Visibility = "close" | "friends" | "mutual" | "none"

type ResolvedPlace = {
  name: string
  type: PlaceType
  mapsLink: string
  address: string
  tags: string[]
  visibility: Visibility
}

type SearchResult = {
  id: string
  name: string
  address?: string
  typeLabel?: string
  suggestedType: PlaceType
  rating?: number
  ratingCount?: number
  mapsLink: string
  imageUrl?: string
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty"; query: string }
  | { kind: "results"; query: string; items: SearchResult[] }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string }

const DEBOUNCE_MS = 300

export function AddPlaceFromSearchDialog({
  onPlaceResolved,
}: {
  onPlaceResolved: (place: ResolvedPlace) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [state, setState] = React.useState<SearchState>({ kind: "idle" })
  const search = useIdentifiedAction(api.placesSearch.searchPlacesForProfile)
  // Tracks the latest in-flight request so stale responses can't overwrite
  // newer results (e.g. typing fast).
  const requestIdRef = React.useRef(0)

  // Debounced effect: fire the action whenever the input changes (after a
  // 300ms quiet period). Earlier requests are tombstoned via requestIdRef.
  React.useEffect(() => {
    if (!open) return
    const trimmed = input.trim()
    if (!trimmed) {
      setState({ kind: "idle" })
      return
    }
    const id = ++requestIdRef.current
    setState({ kind: "loading" })
    const handle = setTimeout(async () => {
      try {
        const result = await search({ query: trimmed })
        if (id !== requestIdRef.current) return
        if (result.note) {
          setState({ kind: "unavailable", message: result.note })
          return
        }
        if (result.error) {
          setState({ kind: "error", message: result.error })
          return
        }
        if (!result.places || result.places.length === 0) {
          setState({ kind: "empty", query: trimmed })
          return
        }
        setState({
          kind: "results",
          query: trimmed,
          items: result.places as SearchResult[],
        })
      } catch (err) {
        if (id !== requestIdRef.current) return
        setState({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Unexpected error while searching places.",
        })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(handle)
    }
  }, [input, open, search])

  function reset() {
    setInput("")
    setState({ kind: "idle" })
    requestIdRef.current++
  }

  function handlePick(place: SearchResult) {
    onPlaceResolved({
      name: place.name,
      type: place.suggestedType,
      mapsLink: place.mapsLink,
      address: place.address ?? "",
      tags: [],
      visibility: "friends",
    })
    toast.success(`Added "${place.name}"!`)
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-fit">
          <SearchIcon className="mr-1 size-4" />
          Search for a place
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Find a Place</DialogTitle>
          <DialogDescription>
            Type the name of a spot you love and pick it from the list. We
            pull details straight from Google Maps.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Prince Street Pizza, Regents Park…"
              className="bg-background border-border pl-9"
            />
          </div>
          <ResultsRegion state={state} onPick={handlePick} />
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Can&apos;t find it? You can also paste a Google Maps share link
              or add the place manually.
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResultsRegion({
  state,
  onPick,
}: {
  state: SearchState
  onPick: (p: SearchResult) => void
}) {
  if (state.kind === "idle") {
    return (
      <p className="rounded-md border border-dashed bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
        Start typing to see matching places.
      </p>
    )
  }
  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-6 text-xs text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Searching…
      </div>
    )
  }
  if (state.kind === "empty") {
    return (
      <p className="rounded-md border border-dashed bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
        No places matched{" "}
        <span className="font-medium text-foreground">“{state.query}”</span>.
        Try a different spelling or add the neighborhood.
      </p>
    )
  }
  if (state.kind === "unavailable") {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        {state.message}
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {state.message}
      </div>
    )
  }
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border bg-background">
      <ul className="divide-y">
        {state.items.map((item) => (
          <li key={item.id}>
            <ResultRow item={item} onPick={() => onPick(item)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultRow({
  item,
  onPick,
}: {
  item: SearchResult
  onPick: () => void
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 text-slate-50">
          <MapPinIcon className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          {item.typeLabel && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {item.typeLabel}
            </Badge>
          )}
        </div>
        {item.address && (
          <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="size-3 shrink-0 translate-y-0.5" />
            <span className="line-clamp-2">{item.address}</span>
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {typeof item.rating === "number" && (
            <span className="inline-flex items-center gap-1">
              <StarIcon className="size-3 fill-amber-400 stroke-amber-500" />
              {item.rating.toFixed(1)}
              {item.ratingCount ? ` (${item.ratingCount})` : ""}
            </span>
          )}
          <a
            href={item.mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            Preview in Maps
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onPick}
        className="shrink-0"
      >
        <PlusIcon className="mr-1 size-3.5" />
        Pick
      </Button>
    </div>
  )
}
