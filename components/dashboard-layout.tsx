"use client"

// Shared layout primitives for every page under /dashboard.
//
// Why this exists: the Homie page established the "edge-to-edge columns with
// separator lines instead of floating cards" aesthetic. These helpers codify
// that shape so the other pages don't have to reinvent it (and drift from
// each other).
//
// Building blocks:
//   <PageShell header={<SiteHeader …/>}>…</PageShell>
//       Top-level wrapper. Fills the SidebarInset, renders `header` at the
//       top, then lays out children as one horizontal flex row that fills
//       the remaining height and hides overflow — the standard
//       "header + columns below" silhouette.
//
//   <ColumnHeader title="…" icon={…} actions={…} />
//       65-px tall bar at the top of every column, matching the Conversations
//       header on /dashboard/homie. Bottom border, title on the left,
//       actions on the right.
//
//   <ResizeHandle onMouseDown={start} />
//       Thin vertical grabber placed between two columns. Call `start()` in
//       response to mousedown to begin a drag — the parent holds width state.
//
//   useResizableWidth({ initial, min, max, side })
//       Manages a single column's width as pixels. Returns `width`,
//       `setWidth`, and an `onMouseDown` callback bound to the window-level
//       drag listeners. Side="right" means the handle is on the column's
//       right edge (dragging right grows it); side="left" means the handle
//       is on the column's left edge (dragging left grows it).
//
//   <CollapseButton side="left|right" open={…} onToggle={…} />
//       Consistent ghost-icon button for toggling a side pane open/closed.

import * as React from "react"
import { PanelLeftIcon, PanelRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// <PageShell>
// ─────────────────────────────────────────────────────────────────────────────

export function PageShell({
  header,
  children,
  className,
}: {
  header: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex h-[calc(100vh-1rem)] flex-col", className)}>
      {header}
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// <ColumnHeader>
// ─────────────────────────────────────────────────────────────────────────────

export function ColumnHeader({
  title,
  icon,
  actions,
  className,
}: {
  title?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-[65px] shrink-0 items-center justify-between gap-2 border-b px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-base font-semibold">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        {title ? <span className="min-w-0 truncate">{title}</span> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// <ResizeHandle> + useResizableWidth
// ─────────────────────────────────────────────────────────────────────────────

type ResizeSide = "left" | "right"

export function useResizableWidth({
  initial,
  min = 240,
  max = 720,
  side = "right",
}: {
  initial: number
  min?: number
  max?: number
  side?: ResizeSide
}) {
  const [width, setWidth] = React.useState(initial)
  const [dragging, setDragging] = React.useState(false)
  // The column we're measuring from. We capture it on mousedown so the
  // listener doesn't need to look it up every pointer move.
  const originRef = React.useRef<{ left: number; right: number } | null>(null)

  const onMouseDown = React.useCallback(
    (event: React.MouseEvent) => {
      // Grab the column element by walking up from the handle. The handle
      // is rendered as a *sibling* of the column it resizes, so we use the
      // closest flex ancestor's children to derive bounds.
      const handleEl = event.currentTarget as HTMLElement
      const parent = handleEl.parentElement
      if (!parent) return
      const column =
        side === "right"
          ? handleEl.previousElementSibling
          : handleEl.nextElementSibling
      if (!(column instanceof HTMLElement)) return
      const rect = column.getBoundingClientRect()
      originRef.current = { left: rect.left, right: rect.right }
      setDragging(true)
      event.preventDefault()
    },
    [side],
  )

  React.useEffect(() => {
    if (!dragging) return
    const handleMove = (event: MouseEvent) => {
      const origin = originRef.current
      if (!origin) return
      const next =
        side === "right"
          ? event.clientX - origin.left
          : origin.right - event.clientX
      setWidth(Math.max(min, Math.min(max, next)))
    }
    const stop = () => setDragging(false)
    document.addEventListener("mousemove", handleMove)
    document.addEventListener("mouseup", stop)
    // UX: freeze cursor + suppress text selection while dragging.
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseup", stop)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [dragging, min, max, side])

  return { width, setWidth, onMouseDown }
}

// The handle itself is a 1-px-wide visible line (same thickness as the
// horizontal `border-b` lines in column headers / composers) so the
// T-junctions between columns and rows connect cleanly. For grab ergonomics
// we expand the *hit area* via a `::before` pseudo that extends ~6 px on each
// side of the 1-px line. Pseudo-elements inherit their host's pointer events,
// so a mousedown anywhere inside the wider zone still triggers the handle.
// `z-10` keeps the pseudo above its flex-sibling columns; without it the
// right column's content would swallow pointer events in the overlap.
export function ResizeHandle({
  onMouseDown,
  className,
  label = "Resize panel",
}: {
  onMouseDown: (event: React.MouseEvent) => void
  className?: string
  label?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onMouseDown={onMouseDown}
      className={cn(
        "relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border transition-colors hover:bg-primary/60",
        "before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:cursor-col-resize before:content-['']",
        className,
      )}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// <CollapseButton>
// ─────────────────────────────────────────────────────────────────────────────

export function CollapseButton({
  side,
  open,
  onToggle,
  label,
  className,
}: {
  side: ResizeSide
  open: boolean
  onToggle: () => void
  label?: string
  className?: string
}) {
  const Icon = side === "left" ? PanelLeftIcon : PanelRightIcon
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label ?? (open ? "Collapse panel" : "Expand panel")}
      className={className}
    >
      <Icon className="size-4" />
    </Button>
  )
}
