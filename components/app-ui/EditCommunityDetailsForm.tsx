"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2Icon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { useIdentifiedMutation } from "@/hooks/use-identified"

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

// <EditCommunityDetailsForm /> — the "Details" tab of the community Manage
// page. Mirrors the fields in `/dashboard/communities/new` but diffs the
// submitted values against the existing community doc and only sends a
// minimal `patch` to `updateCommunity` so an unchanged field never clobbers
// a value set by a different admin in the meantime.

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
  locationRadiusKm: z.coerce
    .number()
    .gt(0, "Radius must be positive")
    .max(500, "Radius must be <= 500 km"),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  community: Doc<"communities">
}

export function EditCommunityDetailsForm({ community }: Props) {
  const updateCommunity = useIdentifiedMutation(
    api.communities.updateCommunity,
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      name: community.name,
      description: community.description,
      category: community.category,
      isPublic: community.isPublic ? "public" : "private",
      locationRadiusKm: community.locationRadiusKm,
    },
  })

  // Rehydrate the form when the underlying community doc changes (e.g.
  // someone else just edited it while this tab was open).
  React.useEffect(() => {
    reset({
      name: community.name,
      description: community.description,
      category: community.category,
      isPublic: community.isPublic ? "public" : "private",
      locationRadiusKm: community.locationRadiusKm,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    community._id,
    community.name,
    community.description,
    community.category,
    community.isPublic,
    community.locationRadiusKm,
  ])

  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(
    community.avatarUrl ?? null,
  )
  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(
    community.coverImageUrl ?? null,
  )

  // Reconstruct a ResolvedLocation from whatever the community already has.
  // Legacy rows without `locationPlaceId` still render in the picker — the
  // "Change location" flow will overwrite them with a fresh Places pick.
  const initialLocation: ResolvedLocation = {
    placeId: community.locationPlaceId,
    name: community.locationLabel ?? "Selected location",
    address: community.locationAddress,
    mapsUri: community.locationMapsUri,
    city: community.locationCity,
    country: community.locationCountry,
    lat: community.locationLat,
    lng: community.locationLng,
  }
  const [location, setLocation] = React.useState<ResolvedLocation | null>(
    initialLocation,
  )

  async function onSubmit(values: FormValues) {
    if (!location) {
      toast.error("Pick a location before saving.")
      return
    }
    // Only send keys that actually changed so we don't overwrite unrelated
    // fields another admin may have updated recently.
    const patch: Record<string, unknown> = {}
    if (values.name.trim() !== community.name) patch.name = values.name.trim()
    if (values.description.trim() !== community.description) {
      patch.description = values.description.trim()
    }
    if (values.category !== community.category) patch.category = values.category
    if (values.locationRadiusKm !== community.locationRadiusKm) {
      patch.locationRadiusKm = values.locationRadiusKm
    }
    const nextIsPublic = values.isPublic === "public"
    if (nextIsPublic !== community.isPublic) patch.isPublic = nextIsPublic
    if ((avatarUrl ?? undefined) !== community.avatarUrl) {
      patch.avatarUrl = avatarUrl ?? undefined
    }
    if ((coverImageUrl ?? undefined) !== community.coverImageUrl) {
      patch.coverImageUrl = coverImageUrl ?? undefined
    }

    // Location fields — if any piece of the picked location differs, send
    // the full set so server stays internally consistent (lat/lng pair,
    // placeId / city etc.).
    const locationChanged =
      location.lat !== community.locationLat ||
      location.lng !== community.locationLng ||
      location.placeId !== community.locationPlaceId ||
      location.name !== community.locationLabel ||
      location.address !== community.locationAddress ||
      location.city !== community.locationCity ||
      location.country !== community.locationCountry ||
      location.mapsUri !== community.locationMapsUri
    if (locationChanged) {
      patch.locationLat = location.lat
      patch.locationLng = location.lng
      patch.locationLabel = location.name
      patch.locationPlaceId = location.placeId
      patch.locationAddress = location.address
      patch.locationCity = location.city
      patch.locationCountry = location.country
      patch.locationMapsUri = location.mapsUri
    }

    if (Object.keys(patch).length === 0) {
      toast.info("Nothing to save — no changes.")
      return
    }

    try {
      await updateCommunity({
        communityId: community._id,
        patch,
      })
      toast.success("Community updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update")
    }
  }

  const hasImageChange =
    (avatarUrl ?? undefined) !== community.avatarUrl ||
    (coverImageUrl ?? undefined) !== community.coverImageUrl
  const hasLocationChange =
    location === null ||
    location.lat !== community.locationLat ||
    location.lng !== community.locationLng ||
    location.placeId !== community.locationPlaceId

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="edit-name">Community name</FieldLabel>
          <Input id="edit-name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="edit-description">Description</FieldLabel>
          <Textarea
            id="edit-description"
            rows={4}
            {...register("description")}
          />
          <FieldError errors={[errors.description]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="edit-category">Category</FieldLabel>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fitness">Fitness</SelectItem>
                  <SelectItem value="spiritual">Spiritual</SelectItem>
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
            triggerLabel="Change location"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="edit-locationRadiusKm">Radius (km)</FieldLabel>
          <Input
            id="edit-locationRadiusKm"
            inputMode="decimal"
            className="max-w-[12rem]"
            {...register("locationRadiusKm")}
          />
          <FieldError errors={[errors.locationRadiusKm]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="edit-isPublic">Visibility</FieldLabel>
          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="edit-isPublic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — discoverable</SelectItem>
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
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              (!isDirty && !hasImageChange && !hasLocationChange)
            }
          >
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
      </FieldGroup>
    </form>
  )
}
