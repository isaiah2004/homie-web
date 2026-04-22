"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import {
  BriefcaseIcon,
  CalendarHeartIcon,
  GraduationCapIcon,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  MapPinIcon,
  MusicIcon,
  PlusIcon,
  SparklesIcon,
  UserIcon,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldInfo } from "@/components/app-ui/FieldInfo"
import {
  EventInterestsField,
} from "@/components/app-ui/EventInterestsField"
import { MediaCard } from "@/components/app-ui/MediaCard"
import { cn } from "@/lib/utils"

// ── Schemas ──────────────────────────────────────────────────────────────────

const visibilityEnum = z.enum(["close", "friends", "mutual", "none"])
const sensitiveVisibilityEnum = z.enum(["close", "none"])

const interestSchema = z.object({
  value: z.string().min(1, "Interest is required."),
  visibility: visibilityEnum,
})

const eventInterestSchema = z.object({
  value: z.string().min(1, "Event type required."),
  custom: z.boolean(),
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
  eventInterests: z.array(eventInterestSchema).default([]),
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
  id,
}: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <div
      id={id}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-muted/60 p-6 shadow-sm transition-all hover:shadow-md dark:bg-background/60 scroll-mt-24",
        className,
      )}
    >
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

// ── Media tab configuration ──────────────────────────────────────────────────

type MediaType = z.infer<typeof mediaSchema>["type"]

const MEDIA_TABS: Array<{
  id: string
  label: string
  match: (type: MediaType) => boolean
}> = [
  { id: "all", label: "All", match: () => true },
  { id: "music", label: "Music", match: (t) => t === "music" },
  { id: "movie", label: "Movies", match: (t) => t === "movie" },
  {
    id: "book",
    label: "Books",
    match: (t) => t === "book" || t === "novel",
  },
  { id: "series", label: "Series", match: (t) => t === "series" },
  { id: "podcast", label: "Podcasts", match: (t) => t === "podcast" },
  { id: "anime", label: "Anime", match: (t) => t === "anime" },
  { id: "game", label: "Games", match: (t) => t === "game" },
  { id: "other", label: "Other", match: (t) => t === "other" },
]

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
      eventInterests: [],
      media: [],
      places: [],
      projects: [],
    },
  })

  const interests = useFieldArray({ control: form.control, name: "interests" })
  const media = useFieldArray({ control: form.control, name: "media" })
  const places = useFieldArray({ control: form.control, name: "places" })
  const projects = useFieldArray({ control: form.control, name: "projects" })

  // Watch media to compute per-tab counts; this keeps them reactive without
  // coupling to the field-array `.fields` snapshot which only updates on
  // insert/remove (not on field edits like type changes).
  const watchedMedia = useWatch({
    control: form.control,
    name: "media",
  }) as FormValues["media"] | undefined

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
          eventInterests: devProfile.eventInterests || [],
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
                eventInterests: userProfile.eventInterests || [],
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
          eventInterests: data.eventInterests,
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
      className="flex w-full flex-col gap-8 p-2 md:p-4 lg:p-6"
    >

      {/* ── Top row: Basic Info + Current Status (2-col) ───────────────── */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Basic Info */}
        <SectionCard id="section-basic">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-primary/10 rounded-lg">
              <UserIcon className="size-5 text-primary" />
            </div>
            <div className="text-left flex items-center gap-1">
              <h2 className="text-xl font-semibold">Basic Information</h2>
              <FieldInfo text="Your personal details and profile settings. Name, email, and username are managed in your Clerk account." />
            </div>
          </div>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-2">
                <div className="flex items-center">
                  <FieldLabel htmlFor="profile-name">Full Name</FieldLabel>
                  <FieldInfo
                    text={
                      activeUser.isDevMode
                        ? "Dev mode — pinned to the selected seeded user."
                        : "Managed in your Clerk account."
                    }
                  />
                </div>
                <Input
                  id="profile-name"
                  value={authFullName}
                  readOnly
                  disabled
                  className="h-10 bg-muted/50 border-border cursor-not-allowed"
                />
              </Field>
              <Field className="gap-2">
                <div className="flex items-center">
                  <FieldLabel htmlFor="profile-username">Username</FieldLabel>
                  <FieldInfo
                    text={
                      activeUser.isDevMode
                        ? "Dev mode — set on the seeded user."
                        : "Your unique Clerk handle. Others can find you with this."
                    }
                  />
                </div>
                <Input
                  id="profile-username"
                  value={activeUser.username ? `@${activeUser.username}` : "—"}
                  readOnly
                  disabled
                  className="h-10 bg-muted/50 border-border cursor-not-allowed"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-2">
                <div className="flex items-center">
                  <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                  <FieldInfo
                    text={
                      activeUser.isDevMode
                        ? "Dev mode — set on the seeded user."
                        : "Managed in your Clerk account."
                    }
                  />
                </div>
                <Input
                  id="profile-email"
                  value={activeUser.email ?? "—"}
                  readOnly
                  disabled
                  className="h-10 bg-muted/50 border-border cursor-not-allowed"
                />
              </Field>
              <Controller
                name="dob"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <FieldLabel htmlFor="profile-dob">Date of Birth</FieldLabel>
                    <Input
                      {...field}
                      id="profile-dob"
                      type="date"
                      aria-invalid={fieldState.invalid}
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
              name="visibility"
              control={form.control}
              render={({ field }) => (
                <Field className="gap-2">
                  <div className="flex items-center">
                    <FieldLabel>Profile Visibility</FieldLabel>
                    <FieldInfo text="Who can see your profile by default." />
                  </div>
                  <VisibilitySelect
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </SectionCard>

        {/* Current Status — workplace/school inline */}
        <SectionCard id="section-status" className="flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-primary/10 rounded-lg">
              <span className="text-xl">🎯</span>
            </div>
            <div className="text-left flex items-center gap-1">
              <h2 className="text-xl font-semibold">Current Status</h2>
              <FieldInfo text="Select what applies to you. Location info is only visible to close friends or kept completely private." />
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

            {showWork && (
              <div className="border-l-2 border-primary/40 pl-3 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BriefcaseIcon className="size-4 text-primary" />
                  Workplace
                </div>
                <Controller
                  name="workplace.name"
                  control={form.control}
                  render={({ field }) => (
                    <Field className="gap-1.5">
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
                    <Field data-invalid={fieldState.invalid} className="gap-1.5">
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
                    <Field className="gap-1.5">
                      <FieldLabel>Visibility</FieldLabel>
                      <SensitiveVisibilitySelect
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </Field>
                  )}
                />
              </div>
            )}

            {showStudy && (
              <div className="border-l-2 border-primary/40 pl-3 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GraduationCapIcon className="size-4 text-primary" />
                  Place of Study
                </div>
                <Controller
                  name="school.name"
                  control={form.control}
                  render={({ field }) => (
                    <Field className="gap-1.5">
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
                    <Field data-invalid={fieldState.invalid} className="gap-1.5">
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
                    <Field className="gap-1.5">
                      <FieldLabel>Visibility</FieldLabel>
                      <SensitiveVisibilitySelect
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </Field>
                  )}
                />
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Collapsible list sections (bento accordion grid) ──────── */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Interests */}
        <SectionCard id="section-interests" className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="interests" className="border-none">
            <AccordionItem value="interests" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <SparklesIcon className="size-5 text-primary" />
                  </div>
                  <div className="text-left flex items-center gap-1">
                    <h3 className="text-lg font-semibold">Interests</h3>
                    <FieldInfo text="Add the hobbies and interests you want to share." />
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

        {/* Events */}
        <SectionCard id="section-events" className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="events" className="border-none">
            <AccordionItem value="events" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CalendarHeartIcon className="size-5 text-primary" />
                  </div>
                  <div className="text-left flex items-center gap-1">
                    <h3 className="text-lg font-semibold">Events</h3>
                    <FieldInfo text="Pick the kinds of events you'd go to. Friends can use this to invite you to things they think you'd enjoy." />
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <Controller
                      name="eventInterests"
                      control={form.control}
                      render={({ field }) => {
                        const count = (field.value ?? []).length
                        return count > 0 ? (
                          <Badge variant="secondary">{count}</Badge>
                        ) : (
                          <span />
                        )
                      }}
                    />
                    <svg className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Controller
                  name="eventInterests"
                  control={form.control}
                  render={({ field }) => (
                    <EventInterestsField
                      value={field.value ?? []}
                      onChange={field.onChange}
                      renderVisibility={({ value, onChange }) => (
                        <InlineVisibilityDot value={value} onChange={onChange} />
                      )}
                    />
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>

        {/* Media */}
        <SectionCard id="section-media" className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="media" className="border-none">
            <AccordionItem value="media" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <MusicIcon className="size-5 text-primary" />
                  </div>
                  <div className="text-left flex items-center gap-1">
                    <h3 className="text-lg font-semibold">Media</h3>
                    <FieldInfo text="Your favourite music, movies, books, series, podcasts, anime, and games. Click a card to edit." />
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
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="flex flex-wrap h-auto">
                    {MEDIA_TABS.map((tab) => {
                      const count = (watchedMedia ?? []).filter((m) =>
                        tab.match(m?.type as MediaType),
                      ).length
                      return (
                        <TabsTrigger key={tab.id} value={tab.id}>
                          {tab.label}
                          {count > 0 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              ({count})
                            </span>
                          )}
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>
                  {MEDIA_TABS.map((tab) => {
                    // Map each field-array index to whether its current media
                    // row matches this tab — filter the rendered cards by that.
                    const visibleIndexes = (media.fields ?? [])
                      .map((_, idx) => idx)
                      .filter((idx) => {
                        const t = (watchedMedia?.[idx]?.type ?? "other") as MediaType
                        return tab.match(t)
                      })
                    return (
                      <TabsContent key={tab.id} value={tab.id} className="pt-4">
                        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
                          {visibleIndexes.map((idx) => (
                            <MediaCard
                              key={media.fields[idx]?.id ?? idx}
                              index={idx}
                              form={form}
                              onRemove={() => media.remove(idx)}
                            />
                          ))}
                          <AddMediaButton
                            onClick={() =>
                              media.append({
                                title: "",
                                type:
                                  tab.id === "all" || tab.id === "other"
                                    ? "music"
                                    : tab.id === "book"
                                      ? "book"
                                      : (tab.id as MediaType),
                                visibility: "friends",
                                externalSource: undefined,
                                externalId: undefined,
                                externalKind: undefined,
                                subtitle: undefined,
                                imageUrl: undefined,
                              })
                            }
                          />
                        </div>
                      </TabsContent>
                    )
                  })}
                </Tabs>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>

        {/* Places (spans full width) */}
        <SectionCard id="section-places" className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="places" className="border-none">
            <AccordionItem value="places" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <MapPinIcon className="size-5 text-primary" />
                  </div>
                  <div className="text-left flex items-center gap-1">
                    <h3 className="text-lg font-semibold">Favorite Places</h3>
                    <FieldInfo text="Spots you love — friends can find hangouts near them based on this." />
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
        <SectionCard id="section-projects" className="md:col-span-2">
          <Accordion type="single" collapsible defaultValue="projects" className="border-none">
            <AccordionItem value="projects" className="border-none bg-transparent">
              <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <svg className="size-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-left flex items-center gap-1">
                    <h3 className="text-lg font-semibold">Projects</h3>
                    <FieldInfo text="Things you're building or have built. Tags help others spot shared interests." />
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

// ── Small building blocks used above ─────────────────────────────────────────

function AddMediaButton({ onClick }: { onClick: () => void }) {
  // Matches the MediaCard footprint: aspect-square hero area + ~50px of
  // title/subtitle padding underneath.
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 min-h-[210px] rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      <PlusIcon className="size-5" />
      <span className="text-xs font-medium">Add media</span>
    </button>
  )
}

function InlineVisibilityDot({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label="Visibility"
        className={cn(
          "h-5 w-5 p-0 rounded-full border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0",
          "[&>svg]:hidden",
        )}
      >
        <span
          className={cn(
            "size-2.5 rounded-full",
            value === "close"
              ? "bg-red-500"
              : value === "friends"
                ? "bg-blue-500"
                : value === "mutual"
                  ? "bg-green-500"
                  : "bg-gray-500",
          )}
        />
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
  )
}
