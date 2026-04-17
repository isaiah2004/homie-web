"use client"

import * as React from "react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { MediaSearchPicker } from "./MediaSearchPicker"

export type JikanPick = {
  source: "jikan"
  kind: "anime"
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
}

type Props = {
  value?: { title?: string; subtitle?: string; imageUrl?: string }
  onSelect: (pick: JikanPick) => void
  onClear: () => void
  placeholder?: string
}

export function JikanPicker({
  value,
  onSelect,
  onClear,
  placeholder,
}: Props) {
  const search = useAction(api.jikan.searchJikan)
  const searchFn = React.useCallback(
    async (query: string) =>
      (await search({ query, limit: 6 })) as JikanPick[],
    [search],
  )
  return (
    <MediaSearchPicker
      searchFn={searchFn}
      searchKey="jikan"
      value={value}
      onSelect={onSelect}
      onClear={onClear}
      placeholder={placeholder ?? "Search anime…"}
    />
  )
}
