"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  Loader2Icon,
  MapPinIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useIdentifiedAction } from "@/hooks/use-identified"
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

// <LocationPickerField /> — a reusable location picker powered by the
// Google Places Text Search action. The consumer holds the location in its
// own state and receives a full `ResolvedLocation` payload on pick.
// Designed for the community create / edit flows (city-level picking) but
// generic enough for any "find a place, save full metadata" use case.

const DEBOUNCE_MS = 300

export type ResolvedLocation = {
  // placeId / mapsUri are optional so this type can also represent a legacy
  // community's location that was stored before the Places picker existed.
  // Fresh picks from the Places search dialog always populate both.
  placeId?: string
  name: string
  address?: string
  mapsUri?: string
  city?: string
  country?: string
  lat: number
  lng: number
}

type SearchResult = {
  id: string
  name: string
  address?: string
  typeLabel?: string
  types: string[]
  mapsLink: string
  city?: string
  country?: string
  location?: { latitude: number; longitude: number }
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty"; query: string }
  | { kind: "results"; query: string; items: SearchResult[] }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string }

type Props = {
  value: ResolvedLocation | null
  onChange: (loc: ResolvedLocation | null) => void
  // Optional label override if the caller wants a different CTA text.
  triggerLabel?: string
}

export function LocationPickerField({
  value,
  onChange,
  triggerLabel = "Search a location",
}: Props) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <SelectedLocationCard value={value} onClear={() => onChange(null)} />
      ) : null}

      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-fit">
            <SearchIcon className="mr-1 size-4" />
            {value ? "Change location" : triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Find a Location</DialogTitle>
            <DialogDescription>
              Type a city, neighborhood, or landmark. We pull details straight
              from Google Maps.
            </DialogDescription>
          </DialogHeader>
          <SearchInner
            onPick={(loc) => {
              onChange(loc)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SelectedLocationCard({
  value,
  onClear,
}: {
  value: ResolvedLocation
  onClear: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 text-sm">
      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{value.name}</span>
        </div>
        {value.address ? (
          <p className="truncate text-xs text-muted-foreground">
            {value.address}
          </p>
        ) : null}
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
          {value.city ? ` · ${value.city}` : ""}
          {value.country ? ` · ${value.country}` : ""}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="size-7"
        aria-label="Clear selected location"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  )
}

function SearchInner({
  onPick,
}: {
  onPick: (loc: ResolvedLocation) => void
}) {
  const [input, setInput] = React.useState("")
  const [state, setState] = React.useState<SearchState>({ kind: "idle" })
  const search = useIdentifiedAction(api.placesSearch.searchLocation)
  const requestIdRef = React.useRef(0)

  React.useEffect(() => {
    const trimmed = input.trim()
    if (!trimmed) {
      setState((prev) => (prev.kind === "idle" ? prev : { kind: "idle" }))
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
              : "Unexpected error while searching.",
        })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [input, search])

  function handlePick(item: SearchResult) {
    if (!item.location) {
      toast.error(
        "Couldn't resolve coordinates for that place — try another result.",
      )
      return
    }
    onPick({
      placeId: item.id,
      name: item.name,
      address: item.address,
      mapsUri: item.mapsLink,
      city: item.city,
      country: item.country,
      lat: item.location.latitude,
      lng: item.location.longitude,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Bangalore, Indiranagar, Regents Park…"
          className="pl-9"
        />
      </div>
      <ResultsRegion state={state} onPick={handlePick} />
    </div>
  )
}

function ResultsRegion({
  state,
  onPick,
}: {
  state: SearchState
  onPick: (item: SearchResult) => void
}) {
  if (state.kind === "idle") {
    return (
      <p className="text-sm text-muted-foreground">
        Start typing to see matching locations.
      </p>
    )
  }
  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Searching…
      </div>
    )
  }
  if (state.kind === "empty") {
    return (
      <p className="text-sm text-muted-foreground">
        No places matched &ldquo;{state.query}&rdquo;. Try a broader term.
      </p>
    )
  }
  if (state.kind === "unavailable") {
    return (
      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        {state.message}
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {state.message}
      </div>
    )
  }
  return (
    <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
      {state.items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item)}
          className="flex items-start gap-3 rounded-md border border-transparent bg-card px-3 py-2 text-left text-sm transition hover:border-border hover:bg-muted/50"
        >
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.name}</p>
            {item.address ? (
              <p className="truncate text-xs text-muted-foreground">
                {item.address}
              </p>
            ) : null}
            {item.typeLabel || item.city ? (
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {[item.typeLabel, item.city].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  )
}
