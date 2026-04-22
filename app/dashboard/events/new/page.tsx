"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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

// Schema. datetime-local strings are coerced to epoch ms on submit.
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
    coverImageUrl: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  })
  .refine(
    (v) => {
      if (!v.endsAt) return true
      return new Date(v.endsAt).getTime() >= new Date(v.startsAt).getTime()
    },
    { message: "End time must be after start time", path: ["endsAt"] },
  )

type FormValues = z.infer<typeof formSchema>

// Converts a datetime-local string (yyyy-MM-ddTHH:mm) to epoch ms using the
// browser's local timezone — matches what the user sees in the picker.
function datetimeLocalToEpoch(s: string): number {
  return new Date(s).getTime()
}

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()

  const createEvent = useIdentifiedMutation(api.events.createEvent)
  const parseMapsLink = useIdentifiedAction(
    api.parseGoogleMapsLink.parseGoogleMapsLink,
  )

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
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

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="New Event" />
        <PickDevUserEmptyState pageName="events" />
      </div>
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      const id: Id<"events"> = await createEvent({
        name: values.name,
        description: values.description || undefined,
        startsAt: datetimeLocalToEpoch(values.startsAt),
        endsAt: values.endsAt ? datetimeLocalToEpoch(values.endsAt) : undefined,
        locationName: values.locationName || undefined,
        locationAddress: values.locationAddress || undefined,
        locationMapsLink: values.locationMapsLink || undefined,
        visibility: values.visibility,
        coverImageUrl: values.coverImageUrl || undefined,
      })
      toast.success("Event created")
      router.push(`/dashboard/events/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event")
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
      setValue("locationName", parsed.name, { shouldValidate: true })
      if (parsed.address) {
        setValue("locationAddress", parsed.address, { shouldValidate: true })
      }
      if (parsed.mapsLink) {
        setValue("locationMapsLink", parsed.mapsLink, { shouldValidate: true })
      }
      toast.success("Location parsed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't parse link")
    } finally {
      setParsing(false)
    }
  }

  return (
    <div>
      <SiteHeader pageName="New Event" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/events">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <form onSubmit={handleSubmit(onSubmit)}>
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
                    Description <span className="text-muted-foreground">(optional)</span>
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
                    <FieldLabel htmlFor="locationName">
                      Location name
                    </FieldLabel>
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
                  <FieldDescription>
                    A hosted URL for now. R2 upload support will land later.
                  </FieldDescription>
                  <FieldError errors={[errors.coverImageUrl]} />
                </Field>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href="/dashboard/events">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      "Create event"
                    )}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
