"use client"

import * as React from "react"
import { api } from "@/convex/_generated/api"
import { useIdentifiedAction } from "@/hooks/use-identified"
import { MediaSearchPicker } from "./MediaSearchPicker"
import type { NormalizedOpenLibraryResult } from "@/convex/openLibrary"

export type OpenLibraryPick = NormalizedOpenLibraryResult

type Props = {
  value?: { title?: string; subtitle?: string; imageUrl?: string }
  onSelect: (pick: OpenLibraryPick) => void
  onClear: () => void
  placeholder?: string
}

export function OpenLibraryPicker({
  value,
  onSelect,
  onClear,
  placeholder,
}: Props) {
  const search = useIdentifiedAction(api.openLibrary.searchOpenLibrary)
  const searchFn = React.useCallback(
    async (query: string) =>
      (await search({ query, limit: 6 })) as OpenLibraryPick[],
    [search],
  )
  return (
    <MediaSearchPicker
      searchFn={searchFn}
      searchKey="openlibrary"
      value={value}
      onSelect={onSelect}
      onClear={onClear}
      placeholder={placeholder ?? "Search books…"}
    />
  )
}
