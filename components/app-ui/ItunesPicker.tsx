"use client"

import * as React from "react"
import { api } from "@/convex/_generated/api"
import { useIdentifiedAction } from "@/hooks/use-identified"
import { MediaSearchPicker } from "./MediaSearchPicker"
import type { NormalizedItunesResult } from "@/convex/itunes"

export type ItunesPick = NormalizedItunesResult

type Props = {
  value?: { title?: string; subtitle?: string; imageUrl?: string }
  onSelect: (pick: ItunesPick) => void
  onClear: () => void
  placeholder?: string
}

export function ItunesPicker({
  value,
  onSelect,
  onClear,
  placeholder = "Search movies…",
}: Props) {
  const search = useIdentifiedAction(api.itunes.searchItunes)
  const searchFn = React.useCallback(
    async (query: string) =>
      (await search({ query, limit: 6 })) as ItunesPick[],
    [search],
  )
  return (
    <MediaSearchPicker
      searchFn={searchFn}
      searchKey="itunes"
      value={value}
      onSelect={onSelect}
      onClear={onClear}
      placeholder={placeholder}
    />
  )
}
