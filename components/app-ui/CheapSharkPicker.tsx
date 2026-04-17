"use client"

import * as React from "react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { MediaSearchPicker } from "./MediaSearchPicker"
import type { NormalizedCheapSharkResult } from "@/convex/cheapShark"

export type CheapSharkPick = NormalizedCheapSharkResult

type Props = {
  value?: { title?: string; subtitle?: string; imageUrl?: string }
  onSelect: (pick: CheapSharkPick) => void
  onClear: () => void
  placeholder?: string
}

export function CheapSharkPicker({
  value,
  onSelect,
  onClear,
  placeholder,
}: Props) {
  const search = useAction(api.cheapShark.searchCheapShark)
  const searchFn = React.useCallback(
    async (query: string) =>
      (await search({ query, limit: 6 })) as CheapSharkPick[],
    [search],
  )
  return (
    <MediaSearchPicker
      searchFn={searchFn}
      searchKey="cheapshark"
      value={value}
      onSelect={onSelect}
      onClear={onClear}
      placeholder={placeholder ?? "Search games…"}
    />
  )
}
