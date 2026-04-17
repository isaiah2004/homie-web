"use client"

import * as React from "react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { MediaSearchPicker } from "./MediaSearchPicker"

export type SpotifyKind = "track" | "album" | "artist" | "show"

export type SpotifyPick = {
  source: "spotify"
  kind: SpotifyKind
  id: string
  uri: string
  title: string
  subtitle?: string
  imageUrl?: string
}

type Props = {
  kinds: SpotifyKind[]
  value?: { title?: string; subtitle?: string; imageUrl?: string }
  onSelect: (pick: SpotifyPick) => void
  onClear: () => void
  placeholder?: string
}

export function SpotifyPicker({
  kinds,
  value,
  onSelect,
  onClear,
  placeholder = "Search Spotify…",
}: Props) {
  const search = useAction(api.spotify.searchSpotify)
  const searchFn = React.useCallback(
    async (query: string) =>
      (await search({ query, kinds, limit: 6 })) as SpotifyPick[],
    [search, kinds],
  )
  return (
    <MediaSearchPicker
      searchFn={searchFn}
      searchKey={kinds.join(",")}
      value={value}
      onSelect={onSelect}
      onClear={onClear}
      placeholder={placeholder}
    />
  )
}
