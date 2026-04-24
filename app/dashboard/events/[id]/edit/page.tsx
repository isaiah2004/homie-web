"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import {
  useIdentifiedAction,
  useIdentifiedMutation,
} from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Edit form schema — matches the create page's shape so the fields
// render identically. `startsAt` / `endsAt` are datetime-local strings
// coerced to epoch ms on submit.
const formSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Description is too long")
      .optional()
      .or(z.literal("")),
    startsAt: z.string().min(1, "Start time is required"),
    endsAt: z.string().optional().or(z.literal("")),
    locationName: z.string().trim().optional().or(z.literal("")),
    locationAddress: z.string().trim().optional().or(z.literal("")),
    locationMapsLink: z.string().trim().optional().or(z.literal("")),
    visibility: z.enum(["public", "friends", "invitees"]),
    coverImageUrl: z
      .string()
      .trim()
      .url("Must be a valid URL")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (v) => {
      if (!v.endsAt) return true
      return new Date(v.endsAt).getTime() >= new Date(v.startsAt).getTime()
    },
    { message: "End time must be after start time", path: ["endsAt"] },
  )

type FormValues = z.infer<typeof formSchema>

function datetimeLocalToEpoch(s: string): number {
  return new Date(s).getTime()
}

// Convert an epoch ms to the `yyyy-MM-ddTHH:mm` shape the datetime-local
// input expects in the viewer's local timezone. We can't just ISO-stringify
// because that'd produce UTC.
function epochToDatetimeLocal(ms: number | undefined): string {
  if (ms === undefined) return ""
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const eventId = params.id as Id<"events">

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const data = useQuery(
    api.events.getEventForViewer,
    skip ? "skip" : { eventId, ...identityArg },
  )
  const updateEvent = useIdentifiedMutation(api.events.updateEvent)
  const parseMapsLink = useIdentifiedAction(
    api.parseGoogleMapsLink.parseGoogleMapsLink,
  )

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      name: "",
      description: "",
      startsAt: "",
      endsAt: "",
      locationName: "",
      locationAddress: "",
      locationMapsLink: "",
      visibility: "friends",
      coverImageUrl: "",
    },
  })

  const [parsing, setParsing] = React.useState(false)

  // Seed the form once the event has loaded. We use `reset` rather than
  // per-field `setValue` so react-hook-form treats the seeded values as
  // the baseline and `isDirty` reflects actual edits, not the initial
  // hydration.
  const hydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (hydratedRef.current) return
    if (!data) return
    const { event } = data
    reset({
      name: event.name,
      description: event.description ?? "",
      startsAt: epochToDatetimeLocal(event.startsAt),
      endsAt: epochToDatetimeLocal(event.endsAt),
      locationName: event.locationName ?? "",
      locationAddress: event.locationAddress ?? "",
      locationMapsLink: event.locationMapsLink ?? "",
      visibility: event.visibility,
      coverImageUrl: event.coverImageUrl ?? "",
    })
    hydratedRef.current = true
  }, [data, reset])

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Edit Event" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="events" />
        </div>
      </PageShell>
    )
  }

  if (data === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="Edit Event" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  if (data === null || !data.isCreator) {
    return (
      <PageShell header={<SiteHeader pageName="Edit Event" />}>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-6">
            <div className="rounded-lg border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Not allowed</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Only the event host can edit this event.
              </p>
              <Button asChild className="mt-4">
                <Link href={`/dashboard/events/${eventId}`}>
                  Back to event
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  async function onSubmit(values: FormValues) {
    if (!data) return
    const { event } = data
    const nextStart = datetimeLocalToEpoch(values.startsAt)
    const nextEnd = values.endsAt
      ? datetimeLocalToEpoch(values.endsAt)
      : null
    // Warn if the caller is about to reset everyone's RSVP. The server
    // handles the reset unconditionally — this is just giving the host
    // a chance to back out.
    if (nextStart !== event.startsAt) {
      const ok = window.confirm(
        "Changing the start time will reset all attendees to 'pending' and notify them. Continue?",
      )
      if (!ok) return
    }
    try {
      await updateEvent({
        eventId,
        patch: {
          name: values.name,
          description: values.description || undefined,
          startsAt: nextStart,
          endsAt: nextEnd,
          locationName: values.locationName || null,
          locationAddress: values.locationAddress || null,
          locationMapsLink: values.locationMapsLink || null,
          visibility: values.visibility,
          coverImageUrl: values.coverImageUrl || null,
        },
      })
      toast.success("Event updated")
      router.push(`/dashboard/events/${eventId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update event")
    }
  }

  async function handleParseMapsLink() {
    const url = watch("locationMapsLink")?.trim()
    if (!url) {
      toast.error("Paste a Google Maps link first")
      return
    }
    setParsing(true)
    try {
      const parsed = await parseMapsLink({ url })
      setValue("locationName", parsed.name, { shouldValidate: true, shouldDirty: true })
      if (parsed.address) {
        setValue("locationAddress", parsed.address, { shouldValidate: true, shouldDirty: true })
      }
      if (parsed.mapsLink) {
        setValue("locationMapsLink", parsed.mapsLink, { shouldValidate: true, shouldDirty: true })
      }
      toast.success("Location parsed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't parse link")
    } finally {
      setParsing(false)
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="Edit Event" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/events/${eventId}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-base font-semibold">Edit event</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Changing the start time resets RSVPs. Changing the venue or
              end time notifies attendees who&apos;ve already responded.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    placeholder="Movie night"
                    {...register("name")}
                  />
                  <FieldError errors={[errors.name]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="description">
                    Description{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Textarea
                    id="description"
                    rows={3}
                    placeholder="Bring snacks, we'll supply the popcorn."
                    {...register("description")}
                  />
                  <FieldError errors={[errors.description]} />
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="startsAt">Starts</FieldLabel>
                    <Input
                      id="startsAt"
                      type="datetime-local"
                      {...register("startsAt")}
                    />
                    <FieldError errors={[errors.startsAt]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="endsAt">
                      Ends{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id="endsAt"
                      type="datetime-local"
                      {...register("endsAt")}
                    />
                    <FieldError errors={[errors.endsAt]} />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="locationMapsLink">
                    Google Maps link{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="locationMapsLink"
                      placeholder="https://maps.app.goo.gl/..."
                      {...register("locationMapsLink")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={parsing}
                      onClick={handleParseMapsLink}
                    >
                      {parsing ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        "Parse"
                      )}
                    </Button>
                  </div>
                  <FieldDescription>
                    Paste a Google Maps link and we&apos;ll fill name + address.
                  </FieldDescription>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="locationName">Location name</FieldLabel>
                    <Input
                      id="locationName"
                      placeholder="Arjun's apartment"
                      {...register("locationName")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="locationAddress">Address</FieldLabel>
                    <Input
                      id="locationAddress"
                      placeholder="221B Baker Street"
                      {...register("locationAddress")}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
                  <Controller
                    control={control}
                    name="visibility"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="visibility">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">
                            Public — any signed-in user can see
                          </SelectItem>
                          <SelectItem value="friends">
                            Friends — only your accepted friends
                          </SelectItem>
                          <SelectItem value="invitees">
                            Invite-only — only people you invite
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.visibility]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="coverImageUrl">
                    Cover image URL{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="coverImageUrl"
                    placeholder="https://example.com/cover.jpg"
                    {...register("coverImageUrl")}
                  />
                  <FieldError errors={[errors.coverImageUrl]} />
                </Field>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href={`/dashboard/events/${eventId}`}>Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  To add or remove invitees, use the{" "}
                  <Link
                    href={`/dashboard/events/${eventId}/invite`}
                    className="text-primary hover:underline"
                  >
                    invite page
                  </Link>
                  .
                </p>
              </FieldGroup>
            </form>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
