"use client"

import * as React from "react"
import { api } from "@/convex/_generated/api"
import { useIdentifiedAction } from "@/hooks/use-identified"
import { MediaSearchPicker } from "./MediaSearchPicker"
import type { NormalizedTvMazeResult } from "@/convex/tvmaze"

export type TvMazePick = NormalizedTvMazeResult

type Props = {
  value?: { title?: string; subtitle?: string; imageUrl?: string }
  onSelect: (pick: TvMazePick) => void
  onClear: () => void
  placeholder?: string
}

export function TvMazePicker({
  value,
  onSelect,
  onClear,
  placeholder = "Search TV shows…",
}: Props) {
  const search = useIdentifiedAction(api.tvmaze.searchTvMaze)
  const searchFn = React.useCallback(
    async (query: string) =>
      (await search({ query, limit: 6 })) as TvMazePick[],
    [search],
  )
  return (
    <MediaSearchPicker
      searchFn={searchFn}
      searchKey="tvmaze"
      value={value}
      onSelect={onSelect}
      onClear={onClear}
      placeholder={placeholder}
    />
  )
}
