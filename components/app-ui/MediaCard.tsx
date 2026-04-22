"use client"

import * as React from "react"
import { Controller, useWatch } from "react-hook-form"
import { XIcon, PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotifyPicker } from "@/components/app-ui/SpotifyPicker"
import { ItunesPicker } from "@/components/app-ui/ItunesPicker"
import { TvMazePicker } from "@/components/app-ui/TvMazePicker"
import { OpenLibraryPicker } from "@/components/app-ui/OpenLibraryPicker"
import { JikanPicker } from "@/components/app-ui/JikanPicker"
import { CheapSharkPicker } from "@/components/app-ui/CheapSharkPicker"
import { cn } from "@/lib/utils"

type MediaType =
  | "music"
  | "movie"
  | "book"
  | "novel"
  | "series"
  | "podcast"
  | "anime"
  | "game"
  | "other"

type MusicScope = "track" | "album" | "artist"

const MUSIC_SCOPE_LABELS: Record<MusicScope, string> = {
  track: "Song",
  album: "Album",
  artist: "Artist",
}

const TYPE_LABELS: Record<MediaType, string> = {
  music: "Music",
  movie: "Movie",
  book: "Book",
  novel: "Novel",
  series: "Series",
  podcast: "Podcast",
  anime: "Anime",
  game: "Game",
  other: "Other",
}

const TYPE_GRADIENTS: Record<MediaType, string> = {
  music: "from-pink-500/40 to-purple-500/40",
  movie: "from-amber-500/40 to-red-500/40",
  book: "from-emerald-500/40 to-teal-500/40",
  novel: "from-emerald-500/40 to-lime-500/40",
  series: "from-blue-500/40 to-indigo-500/40",
  podcast: "from-fuchsia-500/40 to-rose-500/40",
  anime: "from-violet-500/40 to-pink-500/40",
  game: "from-sky-500/40 to-cyan-500/40",
  other: "from-zinc-500/40 to-neutral-500/40",
}

const VISIBILITY_COLORS: Record<string, string> = {
  close: "bg-red-500",
  friends: "bg-blue-500",
  mutual: "bg-green-500",
  none: "bg-gray-500",
}

// We intentionally erase the generic here. MediaCard is rendered from
// UserInfoForm with a deeply-typed form; pulling that type in would couple
// this file to the form schema. react-hook-form's string-keyed Controller
// `name` props still work at runtime regardless of the generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = any

type ApplyPick = (pick: {
  source: "spotify" | "itunes" | "tvmaze" | "openlibrary" | "jikan" | "cheapshark"
  kind: string
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
}) => void

type PickerValue = {
  title?: string
  subtitle?: string
  imageUrl?: string
}

function renderPickerFor(
  type: MediaType,
  musicScope: MusicScope,
  value: PickerValue,
  onSelect: ApplyPick,
  onClear: () => void,
  index: number,
  form: AnyForm,
): React.ReactNode {
  if (type === "music") {
    return (
      <SpotifyPicker
        kinds={[musicScope]}
        value={value}
        onSelect={onSelect}
        onClear={onClear}
        placeholder={`Search for a ${MUSIC_SCOPE_LABELS[musicScope].toLowerCase()}…`}
      />
    )
  }
  if (type === "podcast") {
    return (
      <SpotifyPicker
        kinds={["show"]}
        value={value}
        onSelect={onSelect}
        onClear={onClear}
        placeholder="Search podcasts on Spotify…"
      />
    )
  }
  if (type === "movie") {
    return <ItunesPicker value={value} onSelect={onSelect} onClear={onClear} />
  }
  if (type === "series") {
    return <TvMazePicker value={value} onSelect={onSelect} onClear={onClear} />
  }
  if (type === "book" || type === "novel") {
    return (
      <OpenLibraryPicker value={value} onSelect={onSelect} onClear={onClear} />
    )
  }
  if (type === "anime") {
    return <JikanPicker value={value} onSelect={onSelect} onClear={onClear} />
  }
  if (type === "game") {
    return (
      <CheapSharkPicker value={value} onSelect={onSelect} onClear={onClear} />
    )
  }
  return (
    <Controller
      name={`media.${index}.title`}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <Input
            {...field}
            aria-invalid={fieldState.invalid}
            placeholder="e.g. custom entry"
            className="bg-background border-border"
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}

// Full editor used inside the popover. Mirrors the original MediaRow controls.
export function MediaEditor({
  index,
  form,
}: {
  index: number
  form: AnyForm
}) {
  const type = useWatch({
    control: form.control,
    name: `media.${index}.type`,
  }) as MediaType
  const title = useWatch({
    control: form.control,
    name: `media.${index}.title`,
  }) as string | undefined
  const subtitle = useWatch({
    control: form.control,
    name: `media.${index}.subtitle`,
  }) as string | undefined
  const imageUrl = useWatch({
    control: form.control,
    name: `media.${index}.imageUrl`,
  }) as string | undefined
  const externalKind = useWatch({
    control: form.control,
    name: `media.${index}.externalKind`,
  }) as string | undefined

  const [musicScope, setMusicScope] = React.useState<MusicScope>(() => {
    if (
      externalKind === "track" ||
      externalKind === "album" ||
      externalKind === "artist"
    ) {
      return externalKind
    }
    return "track"
  })

  const applyPick: ApplyPick = (pick) => {
    form.setValue(`media.${index}.title`, pick.title, { shouldDirty: true })
    form.setValue(`media.${index}.subtitle`, pick.subtitle, {
      shouldDirty: true,
    })
    form.setValue(`media.${index}.imageUrl`, pick.imageUrl, {
      shouldDirty: true,
    })
    form.setValue(`media.${index}.externalSource`, pick.source, {
      shouldDirty: true,
    })
    form.setValue(`media.${index}.externalId`, pick.id, { shouldDirty: true })
    form.setValue(`media.${index}.externalKind`, pick.kind, {
      shouldDirty: true,
    })
  }

  const clearPick = React.useCallback(() => {
    form.setValue(`media.${index}.title`, "", { shouldDirty: true })
    form.setValue(`media.${index}.subtitle`, undefined, { shouldDirty: true })
    form.setValue(`media.${index}.imageUrl`, undefined, { shouldDirty: true })
    form.setValue(`media.${index}.externalSource`, undefined, {
      shouldDirty: true,
    })
    form.setValue(`media.${index}.externalId`, undefined, {
      shouldDirty: true,
    })
    form.setValue(`media.${index}.externalKind`, undefined, {
      shouldDirty: true,
    })
  }, [form, index])

  // When media.type changes, blow away any stale provider metadata
  // (skip the first mount).
  const prevTypeRef = React.useRef(type)
  React.useEffect(() => {
    if (prevTypeRef.current !== type) {
      clearPick()
      prevTypeRef.current = type
    }
  }, [type, clearPick])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 grid-cols-2">
        <Controller
          name={`media.${index}.type`}
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full border-border bg-background hover:bg-muted/50 transition-colors">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="novel">Novel</SelectItem>
                  <SelectItem value="series">Series</SelectItem>
                  <SelectItem value="podcast">Podcast</SelectItem>
                  <SelectItem value="anime">Anime</SelectItem>
                  <SelectItem value="game">Game</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          name={`media.${index}.visibility`}
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>Visibility</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full border-border bg-background hover:bg-muted/50 transition-colors">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="close">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      Close
                    </div>
                  </SelectItem>
                  <SelectItem value="friends">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      Friends
                    </div>
                  </SelectItem>
                  <SelectItem value="mutual">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      Mutual
                    </div>
                  </SelectItem>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                      No One
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </div>

      {type === "music" && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={musicScope}
          onValueChange={(v) => {
            if (v === "track" || v === "album" || v === "artist") {
              setMusicScope(v)
            }
          }}
        >
          <ToggleGroupItem value="track">Song</ToggleGroupItem>
          <ToggleGroupItem value="album">Album</ToggleGroupItem>
          <ToggleGroupItem value="artist">Artist</ToggleGroupItem>
        </ToggleGroup>
      )}

      {renderPickerFor(
        type,
        musicScope,
        { title, subtitle, imageUrl },
        applyPick,
        clearPick,
        index,
        form,
      )}
    </div>
  )
}

export function MediaCard({
  index,
  form,
  onRemove,
}: {
  index: number
  form: AnyForm
  onRemove: () => void
}) {
  const [open, setOpen] = React.useState(false)

  const type = (useWatch({
    control: form.control,
    name: `media.${index}.type`,
  }) ?? "other") as MediaType
  const title = useWatch({
    control: form.control,
    name: `media.${index}.title`,
  }) as string | undefined
  const subtitle = useWatch({
    control: form.control,
    name: `media.${index}.subtitle`,
  }) as string | undefined
  const imageUrl = useWatch({
    control: form.control,
    name: `media.${index}.imageUrl`,
  }) as string | undefined
  const visibility = (useWatch({
    control: form.control,
    name: `media.${index}.visibility`,
  }) ?? "friends") as string

  const visibilityDot = VISIBILITY_COLORS[visibility] ?? "bg-gray-500"
  const gradient = TYPE_GRADIENTS[type] ?? TYPE_GRADIENTS.other
  const displayTitle = title?.trim() || "Untitled"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="group relative rounded-xl border border-border bg-background/80 overflow-hidden hover:border-foreground/30 hover:shadow-md transition-all">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full text-left"
            aria-label={`Edit ${displayTitle}`}
          >
            <div
              className={cn(
                "relative aspect-square w-full overflow-hidden bg-gradient-to-br",
                gradient,
              )}
            >
              {imageUrl ? (
                // Use a plain <img> here — the image can come from many third-party
                // hosts and we'd rather not maintain a next.config.mjs allowlist
                // for every provider we add. The compact card footprint means the
                // size penalty is negligible.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={displayTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-foreground/60">
                  <span className="text-3xl font-semibold tracking-tight">
                    {displayTitle.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center">
                <span className="flex items-center gap-1 text-xs font-medium text-background opacity-0 group-hover:opacity-100 bg-foreground rounded-full px-2.5 py-1 transition-opacity">
                  <PencilIcon className="size-3" />
                  Edit
                </span>
              </div>
              <span
                className={cn(
                  "absolute top-2 right-2 size-2.5 rounded-full ring-2 ring-background",
                  visibilityDot,
                )}
                aria-label={`Visibility: ${visibility}`}
              />
            </div>
            <div className="p-2.5 pb-3">
              <div className="flex items-start justify-between gap-1.5 mb-1">
                <h4 className="text-sm font-medium truncate flex-1" title={displayTitle}>
                  {displayTitle}
                </h4>
                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                  {TYPE_LABELS[type]}
                </Badge>
              </div>
              {subtitle && (
                <p
                  className="text-xs text-muted-foreground truncate"
                  title={subtitle}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </button>
        </PopoverTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-2 left-2 size-7 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive"
          aria-label="Remove"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)]" align="start">
        <div className="mb-3">
          <h4 className="font-semibold text-sm">Edit media</h4>
          <p className="text-xs text-muted-foreground">
            Changing the type swaps the search provider.
          </p>
        </div>
        <MediaEditor index={index} form={form} />
      </PopoverContent>
    </Popover>
  )
}

