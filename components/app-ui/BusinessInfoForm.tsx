"use client"

import * as React from "react"
import Link from "next/link"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { useMutation, useQuery } from "convex/react"
import {
  BuildingIcon,
  ClockIcon,
  Loader2Icon,
  MapIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FieldInfo } from "@/components/app-ui/FieldInfo"
import { R2ImageUpload } from "@/components/app-ui/r2-image-upload"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

type HoursRow = {
  day: DayKey
  closed: boolean
  open?: string
  close?: string
}

const DAY_ORDER: Array<{ key: DayKey; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
]

// ── Schemas ──────────────────────────────────────────────────────────────────

const categoryEnum = z.enum([
  "restaurant",
  "retail",
  "fitness",
  "tech",
  "service",
  "other",
])

const basicInfoSchema = z.object({
  name: z.string().trim().min(2, "Business name must be at least 2 characters."),
  tagline: z
    .string()
    .max(120, "Tagline must be 120 characters or fewer.")
    .optional()
    .or(z.literal("")),
  category: categoryEnum,
  description: z.string().max(2000, "Description is too long.").optional().or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("Must be a valid URL.")
    .optional()
    .or(z.literal("")),
})

type BasicInfoValues = z.infer<typeof basicInfoSchema>

const contactSchema = z.object({
  contactEmail: z
    .string()
    .email("Must be a valid email.")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().optional().or(z.literal("")),
  contactWhatsapp: z.string().optional().or(z.literal("")),
})

type ContactValues = z.infer<typeof contactSchema>

const locationSchema = z.object({
  locationAddress: z.string().optional().or(z.literal("")),
  locationLat: z.union([z.number(), z.nan()]).optional(),
  locationLng: z.union([z.number(), z.nan()]).optional(),
})

type LocationValues = z.infer<typeof locationSchema>

// ── Shared primitives ────────────────────────────────────────────────────────

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
        <div
          className="w-full h-full bg-repeat bg-center"
          style={{
            backgroundImage:
              "url(/images/textures/davidzydd-mesh-2697072_1920.png)",
            backgroundSize: "300px 300px",
          }}
        />
      </div>
      <div className="relative">{children}</div>
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
      className={cn(
        "relative overflow-hidden rounded-xl border bg-transparent p-5 ring-1 ring-foreground/10",
        className,
      )}
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

function AccordionChevron() {
  return (
    <svg
      className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  )
}

// ── Main form ────────────────────────────────────────────────────────────────

export function BusinessInfoForm() {
  const activeUser = useActiveUser()
  const identityArg = React.useMemo(
    () =>
      activeUser.isDevMode && activeUser.devUserId
        ? { devUserId: activeUser.devUserId }
        : {},
    [activeUser.isDevMode, activeUser.devUserId],
  )

  // Gate queries on `isLoaded` so we don't issue a request with a partially
  // resolved identity. In dev mode we also require a selected user.
  const skipIdentity = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded

  const business = useQuery(
    api.businesses.getMyPrimaryBusiness,
    skipIdentity ? "skip" : identityArg,
  )

  if (business === undefined) {
    // Still loading — match the simple loading shell that the existing
    // profile page uses.
    return (
      <div className="flex w-full flex-col gap-8 p-2 md:p-4 lg:p-6">
        <div className="rounded-xl border bg-muted/40 p-10 text-sm text-muted-foreground">
          Loading business profile…
        </div>
      </div>
    )
  }

  if (business === null) {
    return (
      <div className="flex w-full flex-col gap-8 p-2 md:p-4 lg:p-6">
        <SectionCard>
          <div className="flex flex-col items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BuildingIcon className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">No business yet</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-lg">
                You signed up as a business account but no organization has
                been created yet. Create one to start editing your public
                business profile.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/businesses/new">
                <PlusIcon className="size-4" />
                Create your business profile
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    )
  }

  return <BusinessInfoFormLoaded business={business} />
}

// ── Loaded state ─────────────────────────────────────────────────────────────

function BusinessInfoFormLoaded({
  business,
}: {
  business: Doc<"businesses">
}) {
  return (
    <form
      id="form-business-profile"
      onSubmit={(e) => e.preventDefault()}
      className="flex w-full flex-col gap-8 p-2 md:p-4 lg:p-6"
    >
      <BasicInfoSection business={business} />
      <ContactSection business={business} />
      <PrimaryLocationSection business={business} />
      <BranchesSection businessId={business._id} />
      <ServicesSection businessId={business._id} />
      <HoursSection business={business} />
    </form>
  )
}

// ── Basic information ────────────────────────────────────────────────────────

function BasicInfoSection({ business }: { business: Doc<"businesses"> }) {
  const activeUser = useActiveUser()
  const updateBusiness = useMutation(api.businesses.updateBusiness)

  const form = useForm<BasicInfoValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(basicInfoSchema as any),
    defaultValues: {
      name: business.name ?? "",
      tagline: business.tagline ?? "",
      category: (business.category ?? "other") as BasicInfoValues["category"],
      description: business.description ?? "",
      website: business.website ?? "",
    },
  })

  // Reset when the underlying business row changes (e.g. another tab save).
  React.useEffect(() => {
    form.reset({
      name: business.name ?? "",
      tagline: business.tagline ?? "",
      category: (business.category ?? "other") as BasicInfoValues["category"],
      description: business.description ?? "",
      website: business.website ?? "",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business._id, business.name, business.tagline, business.category, business.description, business.website])

  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    business.logoUrl ?? null,
  )
  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(
    business.coverImageUrl ?? null,
  )

  React.useEffect(() => {
    setLogoUrl(business.logoUrl ?? null)
    setCoverImageUrl(business.coverImageUrl ?? null)
  }, [business._id, business.logoUrl, business.coverImageUrl])

  const [saving, setSaving] = React.useState(false)

  async function onSave(values: BasicInfoValues) {
    setSaving(true)
    try {
      await updateBusiness({
        ...(activeUser.isDevMode && activeUser.devUserId
          ? { devUserId: activeUser.devUserId }
          : {}),
        businessId: business._id,
        patch: {
          name: values.name.trim(),
          tagline: values.tagline ? values.tagline : undefined,
          category: values.category,
          description: values.description ? values.description : undefined,
          website: values.website ? values.website : undefined,
          logoUrl: logoUrl ?? undefined,
          coverImageUrl: coverImageUrl ?? undefined,
        },
      })
      toast.success("Basic info saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard id="section-basic">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-primary/10 rounded-lg">
          <BuildingIcon className="size-5 text-primary" />
        </div>
        <div className="text-left flex items-center gap-1">
          <h2 className="text-xl font-semibold">Basic Information</h2>
          <FieldInfo text="Core details shown on your public business card." />
        </div>
      </div>
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-2">
                <FieldLabel htmlFor="biz-name">Business name</FieldLabel>
                <Input
                  {...field}
                  id="biz-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="Kinara Kitchen"
                  className="h-10 bg-background border-border"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Field className="gap-2">
                <FieldLabel htmlFor="biz-category">Category</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="biz-category"
                    className="h-10 bg-background border-border"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restaurant">Restaurant</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="fitness">Fitness</SelectItem>
                    <SelectItem value="tech">Tech</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="tagline"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-2">
              <div className="flex items-center">
                <FieldLabel htmlFor="biz-tagline">Tagline</FieldLabel>
                <FieldInfo text="A short, punchy one-liner (max 120 characters)." />
              </div>
              <Input
                {...field}
                value={field.value ?? ""}
                id="biz-tagline"
                aria-invalid={fieldState.invalid}
                placeholder="Authentic South Indian, all day."
                maxLength={120}
                className="h-10 bg-background border-border"
              />
              <FieldDescription>
                {(field.value ?? "").length}/120 characters
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-2">
              <FieldLabel htmlFor="biz-description">Description</FieldLabel>
              <Textarea
                {...field}
                value={field.value ?? ""}
                id="biz-description"
                rows={4}
                aria-invalid={fieldState.invalid}
                placeholder="What makes your business special?"
                className="bg-background border-border"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="website"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-2">
              <FieldLabel htmlFor="biz-website">Website</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="biz-website"
                aria-invalid={fieldState.invalid}
                placeholder="https://example.com"
                className="h-10 bg-background border-border"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-2">
            <FieldLabel>Logo</FieldLabel>
            <R2ImageUpload
              value={logoUrl}
              onChange={setLogoUrl}
              kind="image"
              label="Upload logo"
            />
            <FieldDescription>
              Square image recommended (PNG or JPG).
            </FieldDescription>
          </Field>
          <Field className="gap-2">
            <FieldLabel>Cover image</FieldLabel>
            <R2ImageUpload
              value={coverImageUrl}
              onChange={setCoverImageUrl}
              kind="image"
              label="Upload cover"
              previewClassName="h-24 w-48"
            />
            <FieldDescription>
              Wide banner (16:9 works well).
            </FieldDescription>
          </Field>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={saving}
            onClick={form.handleSubmit(onSave)}
          >
            {saving ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save basic info"
            )}
          </Button>
        </div>
      </FieldGroup>
    </SectionCard>
  )
}

// ── Contact ──────────────────────────────────────────────────────────────────

function ContactSection({ business }: { business: Doc<"businesses"> }) {
  const activeUser = useActiveUser()
  const updateBusiness = useMutation(api.businesses.updateBusiness)

  const form = useForm<ContactValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(contactSchema as any),
    defaultValues: {
      contactEmail: business.contactEmail ?? "",
      contactPhone: business.contactPhone ?? "",
      contactWhatsapp: business.contactWhatsapp ?? "",
    },
  })

  React.useEffect(() => {
    form.reset({
      contactEmail: business.contactEmail ?? "",
      contactPhone: business.contactPhone ?? "",
      contactWhatsapp: business.contactWhatsapp ?? "",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business._id, business.contactEmail, business.contactPhone, business.contactWhatsapp])

  const [saving, setSaving] = React.useState(false)

  async function onSave(values: ContactValues) {
    setSaving(true)
    try {
      await updateBusiness({
        ...(activeUser.isDevMode && activeUser.devUserId
          ? { devUserId: activeUser.devUserId }
          : {}),
        businessId: business._id,
        patch: {
          contactEmail: values.contactEmail ? values.contactEmail : undefined,
          contactPhone: values.contactPhone ? values.contactPhone : undefined,
          contactWhatsapp: values.contactWhatsapp ? values.contactWhatsapp : undefined,
        },
      })
      toast.success("Contact info saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const filled = [
    business.contactEmail,
    business.contactPhone,
    business.contactWhatsapp,
  ].filter((v) => !!v && v.length > 0).length

  return (
    <SectionCard id="section-contact">
      <Accordion type="single" collapsible defaultValue="contact" className="border-none">
        <AccordionItem value="contact" className="border-none bg-transparent">
          <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-primary/10 rounded-lg">
                <PhoneIcon className="size-5 text-primary" />
              </div>
              <div className="text-left flex items-center gap-1">
                <h3 className="text-lg font-semibold">Contact</h3>
                <FieldInfo text="Shown on your public business card and ad placements." />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {filled > 0 && (
                  <Badge variant="secondary">{filled}</Badge>
                )}
                <AccordionChevron />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Shown on your public business card and ad placements.
            </p>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="contactEmail"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="gap-2">
                      <FieldLabel htmlFor="biz-contact-email">
                        Public email
                      </FieldLabel>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        id="biz-contact-email"
                        type="email"
                        aria-invalid={fieldState.invalid}
                        placeholder="hello@example.com"
                        className="h-10 bg-background border-border"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <Field className="gap-2">
                      <FieldLabel htmlFor="biz-contact-phone">Phone</FieldLabel>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        id="biz-contact-phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        className="h-10 bg-background border-border"
                      />
                    </Field>
                  )}
                />
              </div>
              <Controller
                control={form.control}
                name="contactWhatsapp"
                render={({ field }) => (
                  <Field className="gap-2">
                    <FieldLabel htmlFor="biz-contact-whatsapp">
                      WhatsApp
                    </FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="biz-contact-whatsapp"
                      type="tel"
                      placeholder="+91 98765 43210"
                      className="h-10 bg-background border-border"
                    />
                  </Field>
                )}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={form.handleSubmit(onSave)}
                >
                  {saving ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save contact"
                  )}
                </Button>
              </div>
            </FieldGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}

// ── Primary location ─────────────────────────────────────────────────────────

function PrimaryLocationSection({ business }: { business: Doc<"businesses"> }) {
  const activeUser = useActiveUser()
  const updateBusiness = useMutation(api.businesses.updateBusiness)

  const form = useForm<LocationValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(locationSchema as any),
    defaultValues: {
      locationAddress: business.locationAddress ?? "",
      locationLat: business.locationLat,
      locationLng: business.locationLng,
    },
  })

  React.useEffect(() => {
    form.reset({
      locationAddress: business.locationAddress ?? "",
      locationLat: business.locationLat,
      locationLng: business.locationLng,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business._id, business.locationAddress, business.locationLat, business.locationLng])

  const [saving, setSaving] = React.useState(false)

  async function onSave(values: LocationValues) {
    setSaving(true)
    try {
      const lat =
        values.locationLat === undefined ||
        (typeof values.locationLat === "number" && Number.isNaN(values.locationLat))
          ? undefined
          : values.locationLat
      const lng =
        values.locationLng === undefined ||
        (typeof values.locationLng === "number" && Number.isNaN(values.locationLng))
          ? undefined
          : values.locationLng
      await updateBusiness({
        ...(activeUser.isDevMode && activeUser.devUserId
          ? { devUserId: activeUser.devUserId }
          : {}),
        businessId: business._id,
        patch: {
          locationAddress: values.locationAddress ? values.locationAddress : undefined,
          locationLat: lat,
          locationLng: lng,
        },
      })
      toast.success("Location saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const hasLocation =
    !!business.locationAddress ||
    business.locationLat !== undefined ||
    business.locationLng !== undefined

  return (
    <SectionCard id="section-primary-location">
      <Accordion type="single" collapsible defaultValue="location" className="border-none">
        <AccordionItem value="location" className="border-none bg-transparent">
          <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MapPinIcon className="size-5 text-primary" />
              </div>
              <div className="text-left flex items-center gap-1">
                <h3 className="text-lg font-semibold">Primary Location</h3>
                <FieldInfo text="Your main storefront or headquarters." />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {hasLocation && <Badge variant="secondary">Set</Badge>}
                <AccordionChevron />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <FieldGroup className="gap-4">
              <Controller
                control={form.control}
                name="locationAddress"
                render={({ field }) => (
                  <Field className="gap-2">
                    <FieldLabel htmlFor="biz-location-address">
                      Address
                    </FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="biz-location-address"
                      placeholder="100ft Road, Indiranagar, Bangalore"
                      className="h-10 bg-background border-border"
                    />
                  </Field>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="locationLat"
                  render={({ field }) => (
                    <Field className="gap-2">
                      <FieldLabel htmlFor="biz-location-lat">Latitude</FieldLabel>
                      <Input
                        id="biz-location-lat"
                        type="number"
                        step="any"
                        value={
                          field.value === undefined || Number.isNaN(field.value)
                            ? ""
                            : field.value
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          field.onChange(v === "" ? undefined : Number(v))
                        }}
                        placeholder="12.9716"
                        className="h-10 bg-background border-border"
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="locationLng"
                  render={({ field }) => (
                    <Field className="gap-2">
                      <FieldLabel htmlFor="biz-location-lng">
                        Longitude
                      </FieldLabel>
                      <Input
                        id="biz-location-lng"
                        type="number"
                        step="any"
                        value={
                          field.value === undefined || Number.isNaN(field.value)
                            ? ""
                            : field.value
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          field.onChange(v === "" ? undefined : Number(v))
                        }}
                        placeholder="77.5946"
                        className="h-10 bg-background border-border"
                      />
                    </Field>
                  )}
                />
              </div>
              <FieldDescription>
                Lat/lng are optional — used by nearby-business surfaces.
              </FieldDescription>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={form.handleSubmit(onSave)}
                >
                  {saving ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save location"
                  )}
                </Button>
              </div>
            </FieldGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}

// ── Branches ─────────────────────────────────────────────────────────────────

type BranchDraft = {
  // Either a real id (persisted) or `null` (new, unsaved draft row).
  id: Id<"businessBranches"> | null
  name: string
  address: string
  phone: string
  email: string
  mapsLink: string
}

function branchToDraft(b: Doc<"businessBranches">): BranchDraft {
  return {
    id: b._id,
    name: b.name ?? "",
    address: b.address ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    mapsLink: b.mapsLink ?? "",
  }
}

function BranchesSection({ businessId }: { businessId: Id<"businesses"> }) {
  const activeUser = useActiveUser()
  const branches = useQuery(api.businessProfile.listBranches, { businessId })
  const addBranch = useMutation(api.businessProfile.addBranch)
  const updateBranch = useMutation(api.businessProfile.updateBranch)
  const removeBranch = useMutation(api.businessProfile.removeBranch)

  // Local editable copy keyed by persisted id or a "draft-N" token. Drafts
  // for unsaved rows live here until the user hits Save.
  const [drafts, setDrafts] = React.useState<Record<string, BranchDraft>>({})
  const [order, setOrder] = React.useState<string[]>([])
  const [savingKey, setSavingKey] = React.useState<string | null>(null)
  const driftCounter = React.useRef(0)

  // Merge server data into local drafts whenever the list changes. We only
  // clobber rows that are persisted (have an id); draft rows (id === null)
  // stay put so a concurrent list refresh doesn't wipe user input.
  React.useEffect(() => {
    if (!branches) return
    setDrafts((prev) => {
      const next = { ...prev }
      const serverIds = new Set<string>()
      for (const b of branches) {
        serverIds.add(b._id)
        next[b._id] = branchToDraft(b)
      }
      // Drop persisted rows that no longer exist on the server.
      for (const key of Object.keys(next)) {
        const d = next[key]
        if (d.id !== null && !serverIds.has(d.id)) delete next[key]
      }
      return next
    })
    setOrder((prev) => {
      const existingDrafts = prev.filter((k) => k.startsWith("draft-"))
      const persisted = branches.map((b) => b._id as string)
      return [...persisted, ...existingDrafts]
    })
  }, [branches])

  function addDraft() {
    const key = `draft-${++driftCounter.current}`
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        id: null,
        name: "",
        address: "",
        phone: "",
        email: "",
        mapsLink: "",
      },
    }))
    setOrder((prev) => [...prev, key])
  }

  function patchDraft(key: string, patch: Partial<BranchDraft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function saveRow(key: string) {
    const d = drafts[key]
    if (!d) return
    const name = d.name.trim()
    if (name.length < 1) {
      toast.error("Branch name cannot be empty")
      return
    }
    setSavingKey(key)
    const idArg =
      activeUser.isDevMode && activeUser.devUserId
        ? { devUserId: activeUser.devUserId }
        : {}
    try {
      if (d.id === null) {
        await addBranch({
          ...idArg,
          businessId,
          name,
          address: d.address || undefined,
          phone: d.phone || undefined,
          email: d.email || undefined,
          mapsLink: d.mapsLink || undefined,
        })
        // Remove the draft key — the query refresh will supply the persisted
        // row under its real id.
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setOrder((prev) => prev.filter((k) => k !== key))
        toast.success("Branch added")
      } else {
        await updateBranch({
          ...idArg,
          branchId: d.id,
          patch: {
            name,
            address: d.address || undefined,
            phone: d.phone || undefined,
            email: d.email || undefined,
            mapsLink: d.mapsLink || undefined,
          },
        })
        toast.success("Branch updated")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save branch")
    } finally {
      setSavingKey(null)
    }
  }

  async function removeRow(key: string) {
    const d = drafts[key]
    if (!d) return
    if (d.id === null) {
      // Just drop the local draft — nothing on the server.
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setOrder((prev) => prev.filter((k) => k !== key))
      return
    }
    const idArg =
      activeUser.isDevMode && activeUser.devUserId
        ? { devUserId: activeUser.devUserId }
        : {}
    try {
      await removeBranch({ ...idArg, branchId: d.id })
      toast.success("Branch removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove branch")
    }
  }

  const count = order.length

  return (
    <SectionCard id="section-branches">
      <Accordion type="single" collapsible defaultValue="branches" className="border-none">
        <AccordionItem value="branches" className="border-none bg-transparent">
          <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MapIcon className="size-5 text-primary" />
              </div>
              <div className="text-left flex items-center gap-1">
                <h3 className="text-lg font-semibold">Branches</h3>
                <FieldInfo text="Additional storefronts or offices beyond your primary location." />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {count > 0 && <Badge variant="secondary">{count}</Badge>}
                <AccordionChevron />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {branches === undefined ? (
              <div className="text-sm text-muted-foreground p-2">
                Loading branches…
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                  {order.map((key, idx) => {
                    const d = drafts[key]
                    if (!d) return null
                    const isNew = d.id === null
                    return (
                      <TexturedCard key={key}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {isNew ? "New branch" : `Branch ${idx + 1}`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(key)}
                              aria-label="Remove branch"
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>

                          <Field className="gap-1.5">
                            <FieldLabel>Name</FieldLabel>
                            <Input
                              value={d.name}
                              onChange={(e) =>
                                patchDraft(key, { name: e.target.value })
                              }
                              placeholder="Downtown branch"
                              className="bg-background border-border"
                            />
                          </Field>
                          <Field className="gap-1.5">
                            <FieldLabel>Address</FieldLabel>
                            <Input
                              value={d.address}
                              onChange={(e) =>
                                patchDraft(key, { address: e.target.value })
                              }
                              placeholder="Street address"
                              className="bg-background border-border"
                            />
                          </Field>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field className="gap-1.5">
                              <FieldLabel>Phone</FieldLabel>
                              <Input
                                value={d.phone}
                                onChange={(e) =>
                                  patchDraft(key, { phone: e.target.value })
                                }
                                type="tel"
                                placeholder="+91 98765 43210"
                                className="bg-background border-border"
                              />
                            </Field>
                            <Field className="gap-1.5">
                              <FieldLabel>Email</FieldLabel>
                              <Input
                                value={d.email}
                                onChange={(e) =>
                                  patchDraft(key, { email: e.target.value })
                                }
                                type="email"
                                placeholder="branch@example.com"
                                className="bg-background border-border"
                              />
                            </Field>
                          </div>
                          <Field className="gap-1.5">
                            <FieldLabel>Google Maps link</FieldLabel>
                            <Input
                              value={d.mapsLink}
                              onChange={(e) =>
                                patchDraft(key, { mapsLink: e.target.value })
                              }
                              placeholder="https://maps.google.com/..."
                              className="bg-background border-border"
                            />
                          </Field>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              disabled={savingKey === key}
                              onClick={() => saveRow(key)}
                            >
                              {savingKey === key ? (
                                <>
                                  <Loader2Icon className="size-4 animate-spin" />
                                  Saving…
                                </>
                              ) : isNew ? (
                                "Save branch"
                              ) : (
                                "Update branch"
                              )}
                            </Button>
                          </div>
                        </div>
                      </TexturedCard>
                    )
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDraft}
                  className="w-fit"
                >
                  <PlusIcon className="mr-1 size-4" />
                  Add branch
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}

// ── Goods & services ─────────────────────────────────────────────────────────

type ServiceKind = "product" | "service"

type ServiceDraft = {
  id: Id<"businessServices"> | null
  kind: ServiceKind
  name: string
  description: string
  priceLabel: string
  imageUrl: string | null
}

function serviceToDraft(s: Doc<"businessServices">): ServiceDraft {
  return {
    id: s._id,
    kind: s.kind,
    name: s.name ?? "",
    description: s.description ?? "",
    priceLabel: s.priceLabel ?? "",
    imageUrl: s.imageUrl ?? null,
  }
}

function ServicesSection({ businessId }: { businessId: Id<"businesses"> }) {
  const activeUser = useActiveUser()
  const services = useQuery(api.businessProfile.listServices, { businessId })
  const addService = useMutation(api.businessProfile.addService)
  const updateService = useMutation(api.businessProfile.updateService)
  const removeService = useMutation(api.businessProfile.removeService)

  const [drafts, setDrafts] = React.useState<Record<string, ServiceDraft>>({})
  const [order, setOrder] = React.useState<string[]>([])
  const [savingKey, setSavingKey] = React.useState<string | null>(null)
  const driftCounter = React.useRef(0)

  React.useEffect(() => {
    if (!services) return
    setDrafts((prev) => {
      const next = { ...prev }
      const serverIds = new Set<string>()
      for (const s of services) {
        serverIds.add(s._id)
        next[s._id] = serviceToDraft(s)
      }
      for (const key of Object.keys(next)) {
        const d = next[key]
        if (d.id !== null && !serverIds.has(d.id)) delete next[key]
      }
      return next
    })
    setOrder((prev) => {
      const existingDrafts = prev.filter((k) => k.startsWith("draft-"))
      const persisted = services.map((s) => s._id as string)
      return [...persisted, ...existingDrafts]
    })
  }, [services])

  function addDraft() {
    const key = `draft-${++driftCounter.current}`
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        id: null,
        kind: "service",
        name: "",
        description: "",
        priceLabel: "",
        imageUrl: null,
      },
    }))
    setOrder((prev) => [...prev, key])
  }

  function patchDraft(key: string, patch: Partial<ServiceDraft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function saveRow(key: string) {
    const d = drafts[key]
    if (!d) return
    const name = d.name.trim()
    if (name.length < 1) {
      toast.error("Name cannot be empty")
      return
    }
    setSavingKey(key)
    const idArg =
      activeUser.isDevMode && activeUser.devUserId
        ? { devUserId: activeUser.devUserId }
        : {}
    try {
      if (d.id === null) {
        await addService({
          ...idArg,
          businessId,
          kind: d.kind,
          name,
          description: d.description || undefined,
          priceLabel: d.priceLabel || undefined,
          imageUrl: d.imageUrl ?? undefined,
        })
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setOrder((prev) => prev.filter((k) => k !== key))
        toast.success("Item added")
      } else {
        await updateService({
          ...idArg,
          serviceId: d.id,
          patch: {
            kind: d.kind,
            name,
            description: d.description || undefined,
            priceLabel: d.priceLabel || undefined,
            imageUrl: d.imageUrl ?? undefined,
          },
        })
        toast.success("Item updated")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingKey(null)
    }
  }

  async function removeRow(key: string) {
    const d = drafts[key]
    if (!d) return
    if (d.id === null) {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setOrder((prev) => prev.filter((k) => k !== key))
      return
    }
    const idArg =
      activeUser.isDevMode && activeUser.devUserId
        ? { devUserId: activeUser.devUserId }
        : {}
    try {
      await removeService({ ...idArg, serviceId: d.id })
      toast.success("Item removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove")
    }
  }

  const count = order.length

  return (
    <SectionCard id="section-services">
      <Accordion type="single" collapsible defaultValue="services" className="border-none">
        <AccordionItem value="services" className="border-none bg-transparent">
          <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-primary/10 rounded-lg">
                <PackageIcon className="size-5 text-primary" />
              </div>
              <div className="text-left flex items-center gap-1">
                <h3 className="text-lg font-semibold">Goods & Services</h3>
                <FieldInfo text="Products and services your business offers." />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {count > 0 && <Badge variant="secondary">{count}</Badge>}
                <AccordionChevron />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {services === undefined ? (
              <div className="text-sm text-muted-foreground p-2">
                Loading items…
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                  {order.map((key, idx) => {
                    const d = drafts[key]
                    if (!d) return null
                    const isNew = d.id === null
                    return (
                      <TexturedCard key={key}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {isNew ? "New item" : `Item ${idx + 1}`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(key)}
                              aria-label="Remove item"
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field className="gap-1.5">
                              <FieldLabel>Kind</FieldLabel>
                              <Select
                                value={d.kind}
                                onValueChange={(v) =>
                                  patchDraft(key, {
                                    kind: v as ServiceKind,
                                  })
                                }
                              >
                                <SelectTrigger className="bg-background border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="product">Product</SelectItem>
                                  <SelectItem value="service">Service</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field className="gap-1.5">
                              <FieldLabel>Name</FieldLabel>
                              <Input
                                value={d.name}
                                onChange={(e) =>
                                  patchDraft(key, { name: e.target.value })
                                }
                                placeholder="Filter coffee"
                                className="bg-background border-border"
                              />
                            </Field>
                          </div>

                          <Field className="gap-1.5">
                            <FieldLabel>Description</FieldLabel>
                            <Textarea
                              value={d.description}
                              onChange={(e) =>
                                patchDraft(key, { description: e.target.value })
                              }
                              placeholder="Short description (optional)"
                              rows={2}
                              className="bg-background border-border"
                            />
                          </Field>

                          <Field className="gap-1.5">
                            <FieldLabel>Price label</FieldLabel>
                            <Input
                              value={d.priceLabel}
                              onChange={(e) =>
                                patchDraft(key, { priceLabel: e.target.value })
                              }
                              placeholder="From ₹80 · $50/hr · Contact for quote"
                              className="bg-background border-border"
                            />
                          </Field>

                          <Field className="gap-1.5">
                            <FieldLabel>Image</FieldLabel>
                            <R2ImageUpload
                              value={d.imageUrl}
                              onChange={(url) =>
                                patchDraft(key, { imageUrl: url })
                              }
                              kind="image"
                              label="Upload image"
                            />
                          </Field>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              disabled={savingKey === key}
                              onClick={() => saveRow(key)}
                            >
                              {savingKey === key ? (
                                <>
                                  <Loader2Icon className="size-4 animate-spin" />
                                  Saving…
                                </>
                              ) : isNew ? (
                                "Save item"
                              ) : (
                                "Update item"
                              )}
                            </Button>
                          </div>
                        </div>
                      </TexturedCard>
                    )
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDraft}
                  className="w-fit"
                >
                  <PlusIcon className="mr-1 size-4" />
                  Add item
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}

// ── Hours of operation ───────────────────────────────────────────────────────

function hoursFromBusiness(business: Doc<"businesses">): HoursRow[] {
  const existing = new Map<DayKey, HoursRow>()
  for (const h of business.hours ?? []) {
    existing.set(h.day as DayKey, {
      day: h.day as DayKey,
      closed: h.closed,
      open: h.open,
      close: h.close,
    })
  }
  return DAY_ORDER.map((d) =>
    existing.get(d.key) ?? {
      day: d.key,
      closed: true,
      open: undefined,
      close: undefined,
    },
  )
}

function HoursSection({ business }: { business: Doc<"businesses"> }) {
  const activeUser = useActiveUser()
  const updateBusiness = useMutation(api.businesses.updateBusiness)

  const [rows, setRows] = React.useState<HoursRow[]>(() =>
    hoursFromBusiness(business),
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setRows(hoursFromBusiness(business))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business._id, business.hours])

  function patchRow(day: DayKey, patch: Partial<HoursRow>) {
    setRows((prev) =>
      prev.map((r) => (r.day === day ? { ...r, ...patch } : r)),
    )
  }

  async function onSave() {
    setSaving(true)
    try {
      const cleaned = rows.map((r) => ({
        day: r.day,
        closed: r.closed,
        open: r.closed ? undefined : r.open || undefined,
        close: r.closed ? undefined : r.close || undefined,
      }))
      await updateBusiness({
        ...(activeUser.isDevMode && activeUser.devUserId
          ? { devUserId: activeUser.devUserId }
          : {}),
        businessId: business._id,
        patch: { hours: cleaned },
      })
      toast.success("Hours saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save hours")
    } finally {
      setSaving(false)
    }
  }

  const openCount = rows.filter((r) => !r.closed).length

  return (
    <SectionCard id="section-hours">
      <Accordion type="single" collapsible defaultValue="hours" className="border-none">
        <AccordionItem value="hours" className="border-none bg-transparent">
          <AccordionTrigger className="px-0 pt-0 hover:no-underline group [&>svg]:hidden">
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClockIcon className="size-5 text-primary" />
              </div>
              <div className="text-left flex items-center gap-1">
                <h3 className="text-lg font-semibold">Hours of Operation</h3>
                <FieldInfo text="Weekly hours. Toggle 'Closed' for days you don't operate." />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {openCount > 0 && (
                  <Badge variant="secondary">{openCount} open</Badge>
                )}
                <AccordionChevron />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3">
              {DAY_ORDER.map((d) => {
                const row = rows.find((r) => r.day === d.key)!
                return (
                  <div
                    key={d.key}
                    className="grid grid-cols-[110px_110px_1fr_1fr] items-center gap-3"
                  >
                    <span className="text-sm font-medium">{d.label}</span>
                    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground select-none">
                      <input
                        type="checkbox"
                        checked={row.closed}
                        onChange={(e) =>
                          patchRow(d.key, { closed: e.target.checked })
                        }
                        className="size-4 rounded border-border"
                      />
                      Closed
                    </label>
                    <Input
                      type="time"
                      value={row.open ?? ""}
                      onChange={(e) =>
                        patchRow(d.key, { open: e.target.value })
                      }
                      disabled={row.closed}
                      aria-label={`${d.label} opening time`}
                      className="h-9 bg-background border-border"
                    />
                    <Input
                      type="time"
                      value={row.close ?? ""}
                      onChange={(e) =>
                        patchRow(d.key, { close: e.target.value })
                      }
                      disabled={row.closed}
                      aria-label={`${d.label} closing time`}
                      className="h-9 bg-background border-border"
                    />
                  </div>
                )
              })}
              <div className="flex justify-end pt-2">
                <Button type="button" disabled={saving} onClick={onSave}>
                  {saving ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save hours"
                  )}
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  )
}

