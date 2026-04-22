"use client"

import * as React from "react"
import { BotIcon, LockIcon, UsersIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type ReplyMode = "private" | "group"

// Toggle pill rendered inside the composer's `replyModeIndicator` slot when
// the user has tagged `@homie`. Pressing Tab in the composer also toggles
// the mode via `onTabKey` wired up at the GroupPane level.
export function ReplyModePill({
  mode,
  onToggle,
}: {
  mode: ReplyMode
  onToggle: () => void
}) {
  const isGroup = mode === "group"
  return (
    <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-3 py-1.5">
      <BotIcon className="size-3.5" />
      <span>Reply mode:</span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isGroup}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
          isGroup
            ? "border-violet-300 bg-violet-200 text-violet-900"
            : "border-violet-200 bg-white text-violet-700 hover:bg-violet-100",
        )}
      >
        {isGroup ? (
          <>
            <UsersIcon className="size-3" />
            Group
          </>
        ) : (
          <>
            <LockIcon className="size-3" />
            Private
          </>
        )}
      </button>
      <span className="ml-auto text-muted-foreground">
        press <kbd className="rounded bg-white px-1 border">Tab</kbd> to toggle
      </span>
    </div>
  )
}
