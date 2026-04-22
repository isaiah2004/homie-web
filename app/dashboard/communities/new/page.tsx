"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { api } from "@/convex/_generated/api"
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
import { R2ImageUpload } from "@/components/app-ui/r2-image-upload"

const formSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(2000, "Description is too long"),
  category: z.enum([
    "fitness",
    "spiritual",
    "hobby",
    "academic",
    "food",
    "social",
    "other",
  ]),
  isPublic: z.enum(["public", "private"]),
  locationLat: z.coerce
    .number()
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  locationLng: z.coerce
    .number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  locationLabel: z.string().trim().optional().or(z.literal("")),
  locationRadiusKm: z.coerce
    .number()
    .gt(0, "Radius must be positive")
    .max(500, "Radius must be <= 500 km"),
  mapsLink: z.string().trim().optional().or(z.literal("")),
})

type FormValues = z.infer<typeof formSchema>

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()

  const createCommunity = useIdentifiedMutation(
    api.communities.createCommunity,
  )
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
      category: "social",
      isPublic: "public",
      locationLat: undefined,
      locationLng: undefined,
      locationLabel: "",
      locationRadiusKm: 25,
      mapsLink: "",
    },
  })

  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [parsing, setParsing] = React.useState(false)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="New Community" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="communities" />
        </div>
      </PageShell>
    )
  }

  async function handleParseMapsLink() {
    const url = watch("mapsLink")?.trim()
    if (!url) {
      toast.error("Paste a Google Maps link first")
      return
    }
    setParsing(true)
    try {
      const parsed = await parseMapsLink({ url })
      if (parsed.name) {
        setValue("locationLabel", parsed.name, { shouldValidate: true })
      }
      toast.success("Label parsed — fill in lat/lng manually for now")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't parse link",
      )
    } finally {
      setParsing(false)
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      const res = await createCommunity({
        name: values.name,
        description: values.description,
        category: values.category,
        locationLat: values.locationLat,
        locationLng: values.locationLng,
        locationLabel: values.locationLabel || undefined,
        locationRadiusKm: values.locationRadiusKm,
        isPublic: values.isPublic === "public",
        coverImageUrl: coverImageUrl ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      })
      toast.success("Community created")
      router.push(`/dashboard/communities/${res.slug}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create community",
      )
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="New Community" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/communities">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <form onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Community name</FieldLabel>
                  <Input
                    id="name"
                    placeholder="Indiranagar Runners"
                    {...register("name")}
                  />
                  <FieldError errors={[errors.name]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <Textarea
                    id="description"
                    rows={4}
                    placeholder="Weekly 5K at Ulsoor lake. Beginners welcome."
                    {...register("description")}
                  />
                  <FieldError errors={[errors.description]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="category">Category</FieldLabel>
                  <Controller
                    control={control}
                    name="category"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fitness">Fitness</SelectItem>
                          <SelectItem value="spiritual">
                            Spiritual
                          </SelectItem>
                          <SelectItem value="hobby">Hobby</SelectItem>
                          <SelectItem value="academic">Academic</SelectItem>
                          <SelectItem value="food">Food</SelectItem>
                          <SelectItem value="social">Social</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.category]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="mapsLink">
                    Google Maps link{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="mapsLink"
                      placeholder="https://maps.app.goo.gl/..."
                      {...register("mapsLink")}
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
                        "Parse label"
                      )}
                    </Button>
                  </div>
                  <FieldDescription>
                    We&apos;ll fill in the location label. Lat/lng still
                    need to be entered by hand for v1.
                  </FieldDescription>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="locationLat">Latitude</FieldLabel>
                    <Input
                      id="locationLat"
                      inputMode="decimal"
                      placeholder="12.9716"
                      {...register("locationLat")}
                    />
                    <FieldError errors={[errors.locationLat]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="locationLng">Longitude</FieldLabel>
                    <Input
                      id="locationLng"
                      inputMode="decimal"
                      placeholder="77.5946"
                      {...register("locationLng")}
                    />
                    <FieldError errors={[errors.locationLng]} />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="locationLabel">
                      Label{" "}
                      <span className="text-muted-foreground">
                        (optional)
                      </span>
                    </FieldLabel>
                    <Input
                      id="locationLabel"
                      placeholder="Indiranagar, Bangalore"
                      {...register("locationLabel")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="locationRadiusKm">
                      Radius (km)
                    </FieldLabel>
                    <Input
                      id="locationRadiusKm"
                      inputMode="decimal"
                      {...register("locationRadiusKm")}
                    />
                    <FieldError errors={[errors.locationRadiusKm]} />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="isPublic">Visibility</FieldLabel>
                  <Controller
                    control={control}
                    name="isPublic"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="isPublic">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">
                            Public — discoverable
                          </SelectItem>
                          <SelectItem value="private">
                            Private — invite only
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <Field>
                  <FieldLabel>Avatar</FieldLabel>
                  <R2ImageUpload
                    value={avatarUrl}
                    onChange={setAvatarUrl}
                    kind="image"
                    label="Upload avatar"
                  />
                </Field>

                <Field>
                  <FieldLabel>Cover image</FieldLabel>
                  <R2ImageUpload
                    value={coverImageUrl}
                    onChange={setCoverImageUrl}
                    kind="image"
                    label="Upload cover"
                    previewClassName="h-24 w-48"
                  />
                </Field>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href="/dashboard/communities">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      "Create community"
                    )}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
