"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import {
  BriefcaseIcon,
  GraduationCapIcon,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedAction } from "@/hooks/use-identified"

import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotifyPicker } from "@/components/app-ui/SpotifyPicker"
import { ItunesPicker } from "@/components/app-ui/ItunesPicker"
import { TvMazePicker } from "@/components/app-ui/TvMazePicker"
import { OpenLibraryPicker } from "@/components/app-ui/OpenLibraryPicker"
import { JikanPicker } from "@/components/app-ui/JikanPicker"
import { CheapSharkPicker } from "@/components/app-ui/CheapSharkPicker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// ── Schemas ──────────────────────────────────────────────────────────────────

const visibilityEnum = z.enum(["close", "friends", "mutual", "none"])
const sensitiveVisibilityEnum = z.enum(["close", "none"])

const interestSchema = z.object({
  value: z.string().min(1, "Interest is required."),
  visibility: visibilityEnum,
})

const placeSchema = z.object({
  name: z.string().min(1, "Place name is required."),
  type: z.enum([
    "restaurant",
    "cafe",
    "bar",
    "park",
    "gym",
    "library",
    "store",
    "hangout",
    "other",
  ]),
  mapsLink: z
    .string()
    .url("Must be a valid URL.")
    .optional()
    .or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()),
  visibility: visibilityEnum,
})

const workplaceSchema = z.object({
  name: z.string().optional(),
  mapsLink: z
    .string()
    .url("Must be a valid URL.")
    .optional()
    .or(z.literal("")),
  visibility: sensitiveVisibilityEnum,
})

const schoolSchema = z.object({
  name: z.string().optional(),
  mapsLink: z
    .string()
    .url("Must be a valid URL.")
    .optional()
    .or(z.literal("")),
  visibility: sensitiveVisibilityEnum,
})

const externalSourceEnum = z.enum([
  "spotify",
  "itunes",
  "tvmaze",
  "openlibrary",
  "jikan",
  "cheapshark",
])

const mediaSchema = z.object({
  title: z.string().min(1, "Title is required."),
  type: z.enum([
    "music",
    "movie",
    "book",
    "novel",
    "series",
    "podcast",
    "anime",
    "game",
    "other",
  ]),
  visibility: visibilityEnum,
  externalSource: externalSourceEnum.optional(),
  externalId: z.string().optional(),
  externalKind: z.string().optional(),
  subtitle: z.string().optional(),
  imageUrl: z.string().optional(),
})

const projectSchema = z.object({
  title: z.string().min(1, "Project title is required."),
  tags: z.array(z.string()),
  description: z.string().optional(),
  visibility: visibilityEnum,
})

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  visibility: visibilityEnum,
  dob: z.string().min(1, "Date of birth is required."),
  workplace: workplaceSchema,
  school: schoolSchema,
  interests: z.array(interestSchema),
  media: z.array(mediaSchema),
  places: z.array(placeSchema),
  projects: z.array(projectSchema),
})

type FormValues = z.infer<typeof formSchema>

// ── Shared components ────────────────────────────────────────────────────────

function VisibilitySelect({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-36 border-border bg-background hover:bg-muted/50 transition-colors">
        <SelectValue placeholder="Visibility" />
      </SelectTrigger>
      <SelectContent className="border-border">
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
  )
}

function SensitiveVisibilitySelect({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-36 border-border bg-background hover:bg-muted/50 transition-colors">
        <SelectValue placeholder="Visibility" />
      </SelectTrigger>
      <SelectContent className="border-border">
        <SelectItem value="close">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            Close Only
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
  )
}

function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = React.useState("")

  function addTag() {
    const trimmed = input.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
      setInput("")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder="Add a tag and press Enter"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag}>
          <PlusIcon className="size-4" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                className="hover:text-destructive"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function AddFromGoogleMapsDialog({
  onPlaceResolved,
}: {
  onPlaceResolved: (place: {
    name: string
    type: "restaurant" | "cafe" | "bar" | "park" | "gym" | "library" | "store" | "hangout" | "other"
    mapsLink: string
    address: string
    tags: string[]
    visibility: "close" | "friends" | "mutual" | "none"
  }) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const [isParsing, setIsParsing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const parseLink = useIdentifiedAction(
    api.parseGoogleMapsLink.parseGoogleMapsLink
  )

  async function handleParse() {
    if (!url.trim()) return
    setError(null)
    setIsParsing(true)
    try {
      const result = await parseLink({ url: url.trim() })
      onPlaceResolved({
        name: result.name,
        type: result.type,
        mapsLink: result.mapsLink,
        address: result.address ?? "",
        tags: [],
        visibility: "friends",
      })
      setUrl("")
      setOpen(false)
      toast.success(`Added "${result.name}"!`)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse Google Maps link",
      )
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setError(null)
          setUrl("")
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-fit">
          <LinkIcon className="mr-1 size-4" />
          Add from Google Maps
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Place from Google Maps</DialogTitle>
          <DialogDescription>
            Paste a Google Maps link and we&apos;ll auto-fill the place details
            for you.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleParse()
              }
            }}
            placeholder="https://maps.app.goo.gl/..."
            className="bg-background border-border"
            disabled={isParsing}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Open Google Maps, find the place, tap{" "}
              <strong>Share</strong> and copy the link. It usually looks like{" "}
              <code className="text-[11px]">maps.app.goo.gl/...</code>
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleParse}
            disabled={isParsing || !url.trim()}
          >
            {isParsing ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Fetching details...
              </>
            ) : (
              "Add Place"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-muted/60 p-6 shadow-sm transition-all hover:shadow-md dark:bg-background/60 ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-0 bg-foreground/[0.04]" />
      <div className="absolute inset-0 opacity-5 mix-blend-overlay">
        <div className="w-full h-full bg-repeat bg-center" style={{ backgroundImage: 'url(/images/textures/davidzydd-mesh-2697072_1920.png)', backgroundSize: '300px 300px' }} />
      </div>
      <div className="relative">
        {children}
      </div>
    </div>
  )
}

function TexturedCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-transparent p-5 ring-1 ring-foreground/10 ${className ?? ""}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-white/[0.06]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            "url(/images/textures/stronger-background-textuer-noise.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

// ── Media row ────────────────────────────────────────────────────────────────
//
// Music/podcast rows use the Spotify picker so users attach a real provider
// id + artwork. Other types stay free-text until their own provider lands.

type MediaType = z.infer<typeof mediaSchema>["type"]
type MusicScope = "track" | "album" | "artist"

const MUSIC_SCOPE_LABELS: Record<MusicScope, string> = {
  track: "Song",
  album: "Album",
  artist: "Artist",
}

type PickerValue = {
  title?: string
  subtitle?: string
  imageUrl?: string
}

type ApplyPick = (pick: {
  source: "spotify" | "itunes" | "tvmaze" | "openlibrary" | "jikan" | "cheapshark"
  kind: string
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
}) => void

function renderPickerFor(
  type: MediaType,
  musicScope: MusicScope,
  value: PickerValue,
  onSelect: ApplyPick,
  onClear: () => void,
  index: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any,
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
    return (
      <ItunesPicker value={value} onSelect={onSelect} onClear={onClear} />
    )
  }
  if (type === "series") {
    return (
      <TvMazePicker value={value} onSelect={onSelect} onClear={onClear} />
    )
  }
  if (type === "book" || type === "novel") {
    return (
      <OpenLibraryPicker
        value={value}
        onSelect={onSelect}
        onClear={onClear}
      />
    )
  }
  if (type === "anime") {
    return (
      <JikanPicker value={value} onSelect={onSelect} onClear={onClear} />
    )
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

function MediaRow({
  index,
  form,
  onRemove,
}: {
  index: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any
  onRemove: () => void
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

  const applyPick = (pick: {
    source: "spotify" | "itunes" | "tvmaze" | "openlibrary" | "jikan" | "cheapshark"
    kind: string
    id: string
    title: string
    subtitle?: string
    imageUrl?: string
  }) => {
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

  // Changing media.type changes which provider the picker talks to (or swaps
  // to free-text). Any previously-attached provider metadata becomes stale
  // and could produce rows like `type: "other"` but `externalSource:
  // "spotify"`. Clear the pick when the type changes (skip initial mount).
  const prevTypeRef = React.useRef(type)
  React.useEffect(() => {
    if (prevTypeRef.current !== type) {
      clearPick()
      prevTypeRef.current = type
    }
  }, [type, clearPick])

  return (
    <TexturedCard>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex flex-col gap-2 md:w-44 md:shrink-0">
          <Controller
            name={`media.${index}.type`}
            control={form.control}
            render={({ field }) => (
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
            )}
          />
          <Controller
            name={`media.${index}.visibility`}
            control={form.control}
            render={({ field }) => (
              <VisibilitySelect
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
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

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </TexturedCard>
  )
}

// ── Main form ────────────────────────────────────────────────────────────────

export function UserInfoForm() {
  const activeUser = useActiveUser()
  const isUserLoaded = activeUser.isLoaded
  const [activeRole, setActiveRole] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const updateProfile = useMutation(api.users.updateProfile)

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      name: "",
      visibility: "friends",
      dob: "",
      workplace: { name: "", mapsLink: "", visibility: "none" },
      school: { name: "", mapsLink: "", visibility: "none" },
      interests: [],
      media: [],
      places: [],
      projects: [],
    },
  })

  const interests = useFieldArray({ control: form.control, name: "interests" })
  const media = useFieldArray({ control: form.control, name: "media" })
  const places = useFieldArray({ control: form.control, name: "places" })
  const projects = useFieldArray({ control: form.control, name: "projects" })

  // The canonical identity for Name comes from the active user (Clerk in
  // production, seeded dev user in dev mode). The form field is uneditable
  // here and simply submits whatever the identity source provides.
  const authFullName = React.useMemo(() => {
    return activeUser.fullName ?? activeUser.username ?? ""
  }, [activeUser.fullName, activeUser.username])

  // Auto-load user profile on page load. Dev mode uses the seeded user's
  // doc directly; production looks up by email.
  const devProfile = useQuery(
    api.users.getUser,
    activeUser.isDevMode && activeUser.devUserId
      ? { userId: activeUser.devUserId }
      : "skip"
  )

  React.useEffect(() => {
    if (!isUserLoaded) return

    // Dev mode: hydrate directly from the selected user's doc.
    if (activeUser.isDevMode) {
      if (devProfile) {
        form.reset({
          name: authFullName || devProfile.name || "",
          visibility: devProfile.visibility || "friends",
          dob: devProfile.dob || "",
          workplace: devProfile.workplace || {
            name: "",
            mapsLink: "",
            visibility: "none",
          },
          school: devProfile.school || {
            name: "",
            mapsLink: "",
            visibility: "none",
          },
          interests: devProfile.interests || [],
          media: devProfile.media || [],
          places: devProfile.places || [],
          projects: devProfile.projects || [],
        })
        if (devProfile.currentStatus) {
          setActiveRole(devProfile.currentStatus)
        }
      }
      return
    }

    // Production: look up by email (Clerk identity).
    if (activeUser.email) {
      const email = activeUser.email
      import("convex/nextjs").then(({ fetchQuery }) => {
        fetchQuery(api.users.getUserByEmail, { email })
          .then((userProfile) => {
            if (userProfile) {
              form.reset({
                name: authFullName || userProfile.name || "",
                visibility: userProfile.visibility || "friends",
                dob: userProfile.dob || "",
                workplace: userProfile.workplace || {
                  name: "",
                  mapsLink: "",
                  visibility: "none",
                },
                school: userProfile.school || {
                  name: "",
                  mapsLink: "",
                  visibility: "none",
                },
                interests: userProfile.interests || [],
                media: userProfile.media || [],
                places: userProfile.places || [],
                projects: userProfile.projects || [],
              })
              if (userProfile.currentStatus) {
                setActiveRole(userProfile.currentStatus)
              }
            } else if (authFullName) {
              form.setValue("name", authFullName)
            }
          })
          .catch((err) => {
            console.error("Error loading user profile:", err)
          })
      })
    }
  }, [
    isUserLoaded,
    activeUser.isDevMode,
    activeUser.email,
    devProfile,
    form,
    authFullName,
  ])

  // Keep the Name field in lock-step with the auth source in case it
  // changes after initial load.
  React.useEffect(() => {
    if (authFullName) form.setValue("name", authFullName)
  }, [authFullName, form])

  async function onSubmit(data: FormValues) {
    if (!activeUser.email) {
      toast.error("Authentication required", {
        description: "Please sign in to save your profile",
      })
      return
    }

    setIsLoading(true)
    try {
      // Dev mode: we already know the Convex user id — skip the
      // getOrCreate round-trip and write straight to that row.
      let userId: Id<"users">
      if (activeUser.isDevMode && activeUser.devUserId) {
        userId = activeUser.devUserId
      } else {
        userId = await getOrCreateUser({
          email: activeUser.email,
          name: data.name,
          username: activeUser.username ?? undefined,
        })
      }

      // Update profile
      await updateProfile({
        userId,
        profile: {
          name: data.name,
          dob: data.dob,
          visibility: data.visibility,
          currentStatus: activeRole as ("work" | "study")[],
          interests: data.interests,
          media: data.media,
          places: data.places,
          projects: data.projects,
          workplace: (data.workplace.name || data.workplace.mapsLink) ? data.workplace : undefined,
          school: (data.school.name || data.school.mapsLink) ? data.school : undefined,
        },
      })

      // Index in Qdrant for semantic search
      await fetch('/api/index-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).catch(err => {
        console.warn('Failed to index profile in Qdrant:', err)
        // Don't fail the whole operation if indexing fails
      })

      toast.success("Profile saved!", {
        description: "Your profile has been updated successfully",
      })
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error("Failed to save profile", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const showWork = activeRole.includes("work")
  const showStudy = activeRole.includes("study")

  return (
    <form
      id="form-user-profile"
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 md:p-8 lg:p-10"
    >

      {/* ── Bento grid ────────────────────────────────────────────────── */}
      <div className="grid gap-8 md:grid-cols-3">
        {/* ── Basics (spans 2 cols on md) ──────────────────────────── */}
        <SectionCard className="md:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <span className="text-xl">👤</span>
            </div>
            <div className="text-left">
              <h2 className="text-xl font-semibold">Basic Information</h2>
              <p className="text-sm text-muted-foreground">Your personal details and profile settings</p>
            </div>
          </div>
          <FieldGroup className="gap-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field className="gap-3">
                <FieldLabel htmlFor="profile-name">Full Name</FieldLabel>
                <Input
                  id="profile-name"
                  value={authFullName}
                  readOnly
                  disabled
                  className="h-11 bg-muted/50 border-border cursor-not-allowed"
                />
                <FieldDescription className="mt-1">
                  {activeUser.isDevMode
                    ? "Dev mode — pinned to the selected seeded user."
                    : "Managed in your Clerk account."}
                </FieldDescription>
              </Field>
              <Field className="gap-3">
                <FieldLabel htmlFor="profile-username">Username</FieldLabel>
                <Input
                  id="profile-username"
                  value={activeUser.username ? `@${activeUser.username}` : "—"}
                  readOnly
                  disabled
                  className="h-11 bg-muted/50 border-border cursor-not-allowed"
                />
                <FieldDescription className="mt-1">
                  {activeUser.isDevMode
                    ? "Dev mode — set on the seeded user."
                    : "Your unique Clerk handle. Others can find you with this."}
                </FieldDescription>
              </Field>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field className="gap-3">
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <Input
                  id="profile-email"
                  value={activeUser.email ?? "—"}
                  readOnly
                  disabled
                  className="h-11 bg-muted/50 border-border cursor-not-allowed"
                />
                <FieldDescription className="mt-1">
                  {activeUser.isDevMode
                    ? "Dev mode — set on the seeded user."
                    : "Managed in your Clerk account."}
                </FieldDescription>
              </Field>
              <Controller
                name="dob"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-3">
                    <FieldLabel htmlFor="profile-dob">Date of Birth</FieldLabel>
                    <Input
                      {...field}
                      id="profile-dob"
                      type="date"
                      aria-invalid={fieldState.invalid}
                      className="h-11 bg-background border-border"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
            <Controller
              name="visibility"
              control={form.control}
              render={({ field }) => (
                <Field className="gap-3">
                  <FieldLabel>Profile Visibility</FieldLabel>
                  <VisibilitySelect
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                  <FieldDescription className="mt-2">
                    Who can see your profile by default.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </SectionCard>

        {/* ── Work & Study toggle (1 col) ─────────────────────────── */}
        <SectionCard className="flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <span className="text-xl">🎯</span>
            </div>
            <div className="text-left">
              <h2 className="text-xl font-semibold">Current Status</h2>
              <p className="text-sm text-muted-foreground">Tell us what you're currently focused on</p>
            </div>
          </div>
          <div className="space-y-4">
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={activeRole}
              onValueChange={setActiveRole}
              className="flex-wrap justify-start gap-3"
              spacing={3}
            >
              <ToggleGroupItem 
                value="work" 
                className="gap-2 px-4 py-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm transition-all"
              >
                <BriefcaseIcon className="size-4" />
                Working
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="study" 
                className="gap-2 px-4 py-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm transition-all"
              >
                <GraduationCapIcon className="size-4" />
                Studying
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg border border-muted/50">
              <span className="inline-flex items-center gap-2">
                <svg className="size-4 text-muted-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Select what applies to you. Location info is only visible to close friends or kept completely private.
              </span>
            </p>
          </div>
        </SectionCard>

        {/* ── Workplace (conditional, spans full on md) ────────────── */}
        {showWork && (
          <SectionCard className="md:col-span-3">
            <Accordion type="single" collapsible defaultValue="workplace" className="border-none">
              <AccordionItem value="workplace" className="border-none bg-transparent">
                <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                  <div className="flex items-center gap-3 w-full">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <BriefcaseIcon className="size-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-semibold">Workplace</h3>
                      <p className="text-sm text-muted-foreground">Add your work location details</p>
                    </div>
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                    <Controller
                      name="workplace.name"
                      control={form.control}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel>Company / Organization</FieldLabel>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Where do you work?"
                            className="bg-background border-border"
                          />
                        </Field>
                      )}
                    />
                    <Controller
                      name="workplace.mapsLink"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>Google Maps Link</FieldLabel>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            aria-invalid={fieldState.invalid}
                            placeholder="https://maps.google.com/..."
                            className="bg-background border-border"
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name="workplace.visibility"
                      control={form.control}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel>Visibility</FieldLabel>
                          <SensitiveVisibilitySelect
                            value={field.value}
                            onValueChange={field.onChange}
                          />
                        </Field>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </SectionCard>
        )}

        {/* ── School (conditional, spans full on md) ───────────────── */}
        {showStudy && (
          <SectionCard className="md:col-span-3">
            <Accordion type="single" collapsible defaultValue="school" className="border-none">
              <AccordionItem value="school" className="border-none bg-transparent">
                <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                  <div className="flex items-center gap-3 w-full">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <GraduationCapIcon className="size-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-semibold">Place of Study</h3>
                      <p className="text-sm text-muted-foreground">Add your educational institution details</p>
                    </div>
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                    <Controller
                      name="school.name"
                      control={form.control}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel>School / University</FieldLabel>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Where do you study?"
                            className="bg-background border-border"
                          />
                        </Field>
                      )}
                    />
                    <Controller
                      name="school.mapsLink"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel>Google Maps Link</FieldLabel>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            aria-invalid={fieldState.invalid}
                            placeholder="https://maps.google.com/..."
                            className="bg-background border-border"
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name="school.visibility"
                      control={form.control}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel>Visibility</FieldLabel>
                          <SensitiveVisibilitySelect
                            value={field.value}
                            onValueChange={field.onChange}
                          />
                        </Field>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </SectionCard>
        )}
      </div>

      {/* ── Collapsible list sections (bento accordion grid) ──────── */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Interests */}
        <SectionCard className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="interests" className="border-none">
            <AccordionItem value="interests" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <svg className="size-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold">Interests</h3>
                    <p className="text-sm text-muted-foreground">Add your hobbies and interests</p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    {interests.fields.length > 0 && (
                      <Badge variant="secondary">
                        {interests.fields.length}
                      </Badge>
                    )}
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4">
                  {interests.fields.map((item, index) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <div className="flex-1">
                        <Controller
                          name={`interests.${index}.value`}
                          control={form.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid} className="gap-2">
                              <Input
                                {...field}
                                aria-invalid={fieldState.invalid}
                                placeholder="e.g. food, gaming"
                                className="h-10 bg-background border-border"
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />
                      </div>
                      <Controller
                        name={`interests.${index}.visibility`}
                        control={form.control}
                        render={({ field }) => (
                          <VisibilitySelect
                            value={field.value}
                            onValueChange={field.onChange}
                          />
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => interests.remove(index)}
                        className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      interests.append({ value: "", visibility: "friends" })
                    }
                    className="w-fit"
                  >
                    <PlusIcon className="mr-1 size-4" />
                    Add Interest
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>

        {/* Media */}
        <SectionCard className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="media" className="border-none">
            <AccordionItem value="media" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <svg className="size-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold">Media</h3>
                    <p className="text-sm text-muted-foreground">Share your favorite music, movies, books</p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    {media.fields.length > 0 && (
                      <Badge variant="secondary">
                        {media.fields.length}
                      </Badge>
                    )}
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4">
                  {media.fields.map((item, index) => (
                    <MediaRow
                      key={item.id}
                      index={index}
                      form={form}
                      onRemove={() => media.remove(index)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      media.append({
                        title: "",
                        type: "music",
                        visibility: "friends",
                        externalSource: undefined,
                        externalId: undefined,
                        externalKind: undefined,
                        subtitle: undefined,
                        imageUrl: undefined,
                      })
                    }
                    className="w-fit"
                  >
                    <PlusIcon className="mr-1 size-4" />
                    Add Media
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>

        {/* Places (spans full width) */}
        <SectionCard className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="places" className="border-none">
            <AccordionItem value="places" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <svg className="size-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold">Favorite Places</h3>
                    <p className="text-sm text-muted-foreground">Add locations you love to visit</p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    {places.fields.length > 0 && (
                      <Badge variant="secondary">
                        {places.fields.length}
                      </Badge>
                    )}
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                    {places.fields.map((item, index) => (
                      <TexturedCard key={item.id}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Place {index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => places.remove(index)}
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>

                          <Controller
                            name={`places.${index}.name`}
                            control={form.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid} className="gap-2">
                                <FieldLabel>Name</FieldLabel>
                                <Input
                                  {...field}
                                  aria-invalid={fieldState.invalid}
                                  placeholder="Place name"
                                  className="bg-background border-border"
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-2">
                            <Controller
                              name={`places.${index}.type`}
                              control={form.control}
                              render={({ field }) => (
                                <Field>
                                  <FieldLabel>Type</FieldLabel>
                                  <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                  >
                                    <SelectTrigger className="w-full border-border bg-background hover:bg-muted/50 transition-colors">
                                      <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="restaurant">
                                        Restaurant
                                      </SelectItem>
                                      <SelectItem value="cafe">Cafe</SelectItem>
                                      <SelectItem value="bar">Bar</SelectItem>
                                      <SelectItem value="park">Park</SelectItem>
                                      <SelectItem value="gym">Gym</SelectItem>
                                      <SelectItem value="library">
                                        Library
                                      </SelectItem>
                                      <SelectItem value="store">
                                        Store
                                      </SelectItem>
                                      <SelectItem value="hangout">
                                        Hangout
                                      </SelectItem>
                                      <SelectItem value="other">
                                        Other
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </Field>
                              )}
                            />
                            <Controller
                              name={`places.${index}.visibility`}
                              control={form.control}
                              render={({ field }) => (
                                <Field>
                                  <FieldLabel>Visibility</FieldLabel>
                                  <VisibilitySelect
                                    value={field.value}
                                    onValueChange={field.onChange}
                                  />
                                </Field>
                              )}
                            />
                          </div>

                          <Controller
                            name={`places.${index}.mapsLink`}
                            control={form.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Google Maps Link</FieldLabel>
                                <Input
                                  {...field}
                                  value={field.value ?? ""}
                                  aria-invalid={fieldState.invalid}
                                  placeholder="https://maps.google.com/..."
                                  className="bg-background border-border"
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />

                          <Controller
                            name={`places.${index}.address`}
                            control={form.control}
                            render={({ field }) => (
                              <Field>
                                <FieldLabel>Address</FieldLabel>
                                <Input
                                  {...field}
                                  value={field.value ?? ""}
                                  placeholder="Street address (optional)"
                                  className="bg-background border-border"
                                />
                              </Field>
                            )}
                          />

                          <Controller
                            name={`places.${index}.tags`}
                            control={form.control}
                            render={({ field }) => (
                              <Field>
                                <FieldLabel>Tags</FieldLabel>
                                <TagInput
                                  tags={field.value}
                                  onChange={field.onChange}
                                />
                              </Field>
                            )}
                          />
                        </div>
                      </TexturedCard>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        places.append({
                          name: "",
                          type: "restaurant",
                          mapsLink: "",
                          address: "",
                          tags: [],
                          visibility: "friends",
                        })
                      }
                      className="w-fit"
                    >
                      <PlusIcon className="mr-1 size-4" />
                      Add Manually
                    </Button>
                    <AddFromGoogleMapsDialog
                      onPlaceResolved={(place) => places.append(place)}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>

        {/* Projects (spans full width) */}
        <SectionCard className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="projects" className="border-none">
            <AccordionItem value="projects" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <svg className="size-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold">Projects</h3>
                    <p className="text-sm text-muted-foreground">Showcase your work and side projects</p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    {projects.fields.length > 0 && (
                      <Badge variant="secondary">
                        {projects.fields.length}
                      </Badge>
                    )}
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                    {projects.fields.map((item, index) => (
                      <TexturedCard key={item.id}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Project {index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => projects.remove(index)}
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>

                          <Controller
                            name={`projects.${index}.title`}
                            control={form.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid} className="gap-2">
                                <FieldLabel>Title</FieldLabel>
                                <Input
                                  {...field}
                                  aria-invalid={fieldState.invalid}
                                  placeholder="Project title"
                                  className="bg-background border-border"
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />

                          <Controller
                            name={`projects.${index}.description`}
                            control={form.control}
                            render={({ field }) => (
                              <Field>
                                <FieldLabel>Description</FieldLabel>
                                <InputGroup>
                                  <InputGroupTextarea
                                    {...field}
                                    value={field.value ?? ""}
                                    placeholder="Brief description (optional)"
                                    rows={3}
                                    className="min-h-16 resize-none"
                                  />
                                  <InputGroupAddon align="block-end">
                                    <InputGroupText className="tabular-nums">
                                      {(field.value ?? "").length} characters
                                    </InputGroupText>
                                  </InputGroupAddon>
                                </InputGroup>
                              </Field>
                            )}
                          />

                          <Controller
                            name={`projects.${index}.visibility`}
                            control={form.control}
                            render={({ field }) => (
                              <Field>
                                <FieldLabel>Visibility</FieldLabel>
                                <VisibilitySelect
                                  value={field.value}
                                  onValueChange={field.onChange}
                                />
                              </Field>
                            )}
                          />

                          <Controller
                            name={`projects.${index}.tags`}
                            control={form.control}
                            render={({ field }) => (
                              <Field>
                                <FieldLabel>Tags</FieldLabel>
                                <TagInput
                                  tags={field.value}
                                  onChange={field.onChange}
                                />
                              </Field>
                            )}
                          />
                        </div>
                      </TexturedCard>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      projects.append({
                        title: "",
                        tags: [],
                        description: "",
                        visibility: "friends",
                      })
                    }
                    className="w-fit"
                  >
                    <PlusIcon className="mr-1 size-4" />
                    Add Project
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="sticky bottom-6 flex items-center justify-end gap-3 rounded-2xl border bg-card/80 backdrop-blur-md px-6 py-4 shadow-sm mt-8">
        <Button type="button" variant="outline" onClick={() => form.reset()}>
          Reset
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </form>
  )
}
