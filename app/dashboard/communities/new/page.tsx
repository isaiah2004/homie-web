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
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
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
import {
  LocationPickerField,
  type ResolvedLocation,
} from "@/components/app-ui/LocationPickerField"

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
  // Radius is still user-editable; lat/lng/label are derived from the
  // LocationPickerField pick and surfaced through a separate state below.
  locationRadiusKm: z.coerce
    .number()
    .gt(0, "Radius must be positive")
    .max(500, "Radius must be <= 500 km"),
})

type FormValues = z.infer<typeof formSchema>

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()

  const createCommunity = useIdentifiedMutation(
    api.communities.createCommunity,
  )

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      name: "",
      description: "",
      category: "social",
      isPublic: "public",
      locationRadiusKm: 25,
    },
  })

  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [location, setLocation] = React.useState<ResolvedLocation | null>(null)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="New Community" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="communities" />
        </div>
      </PageShell>
    )
  }

  async function onSubmit(values: FormValues) {
    if (!location) {
      toast.error("Pick a location for this community.")
      return
    }
    try {
      const res = await createCommunity({
        name: values.name,
        description: values.description,
        category: values.category,
        locationLat: location.lat,
        locationLng: location.lng,
        locationLabel: location.name,
        locationRadiusKm: values.locationRadiusKm,
        locationPlaceId: location.placeId,
        locationMapsUri: location.mapsUri,
        locationAddress: location.address,
        locationCity: location.city,
        locationCountry: location.country,
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
                  <FieldLabel>Location</FieldLabel>
                  <LocationPickerField
                    value={location}
                    onChange={setLocation}
                    triggerLabel="Pick a location"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="locationRadiusKm">
                    Radius (km)
                  </FieldLabel>
                  <Input
                    id="locationRadiusKm"
                    inputMode="decimal"
                    className="max-w-[12rem]"
                    {...register("locationRadiusKm")}
                  />
                  <FieldError errors={[errors.locationRadiusKm]} />
                </Field>

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
