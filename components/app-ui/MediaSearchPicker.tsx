"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { SearchIcon, XIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type NormalizedExternalPick = {
  source: string
  kind: string
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
}

type Props<T extends NormalizedExternalPick> = {
  searchFn: (query: string) => Promise<T[]>
  // Stable key for the current search configuration (e.g. scope/kinds).
  // The debounced search re-runs when this changes. Deps do not include
  // `searchFn` identity so unmemoized callers don't cause fetch churn.
  searchKey?: string
  value?: {
    title?: string
    subtitle?: string
    imageUrl?: string
  }
  onSelect: (pick: T) => void
  onClear: () => void
  placeholder?: string
}

const DEBOUNCE_MS = 300

export function MediaSearchPicker<T extends NormalizedExternalPick>({
  searchFn,
  searchKey,
  value,
  onSelect,
  onClear,
  placeholder = "Search…",
}: Props<T>) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<T[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [rect, setRect] = React.useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  const triggerRef = React.useRef<HTMLDivElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const searchFnRef = React.useRef(searchFn)
  React.useEffect(() => {
    searchFnRef.current = searchFn
  }, [searchFn])

  const hasPick = Boolean(
    value && (value.title || value.imageUrl || value.subtitle),
  )

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (hasPick) return
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const handle = setTimeout(async () => {
      try {
        const out = await searchFnRef.current(q)
        if (cancelled) return
        setResults(out)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Search failed")
        setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, searchKey, hasPick])

  React.useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({
        top: r.bottom + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
      })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, query, loading, results.length, error])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  if (hasPick) {
    return (
      <div className="flex items-center gap-4 rounded-md border border-border bg-background p-3">
        {value?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.imageUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 rounded object-cover shadow-sm"
          />
        ) : (
          <div className="size-16 rounded bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{value?.title}</div>
          {value?.subtitle && (
            <div className="truncate text-xs text-muted-foreground">
              {value.subtitle}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onClear()
            setQuery("")
            setResults([])
            setOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  const shouldShowDropdown =
    open && (query.trim().length > 0 || loading || error !== null)

  const dropdown =
    shouldShowDropdown && rect ? (
      <div
        ref={dropdownRef}
        style={{
          position: "absolute",
          top: rect.top + 4,
          left: rect.left,
          width: rect.width,
          zIndex: 80,
        }}
        className="max-h-80 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
      >
        {loading && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Searching…
          </div>
        )}
        {error && !loading && (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        )}
        {!loading && !error && results.length === 0 && query.trim() && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No results
          </div>
        )}
        {results.map((r) => (
          <button
            key={`${r.source}:${r.kind}:${r.id}`}
            type="button"
            onClick={() => {
              onSelect(r)
              setOpen(false)
              setQuery("")
              setResults([])
            }}
            className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
          >
            {r.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.imageUrl}
                alt=""
                width={48}
                height={48}
                className="size-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="size-12 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.kind}
                {r.subtitle ? ` — ${r.subtitle}` : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    ) : null

  return (
    <>
      <div ref={triggerRef} className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-9 bg-background border-border"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setResults([])
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </>
  )
}
