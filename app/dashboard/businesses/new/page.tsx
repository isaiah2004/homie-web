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
import { Id } from "@/convex/_generated/dataModel"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
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
import { R2ImageUpload } from "@/components/app-ui/r2-image-upload"

const formSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  category: z.enum([
    "restaurant",
    "retail",
    "fitness",
    "tech",
    "service",
    "other",
  ]),
  description: z
    .string()
    .trim()
    .max(2000, "Description is too long")
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  locationAddress: z.string().trim().optional().or(z.literal("")),
})

type FormValues = z.infer<typeof formSchema>

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()

  const createBusiness = useIdentifiedMutation(api.businesses.createBusiness)

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
      category: "other",
      description: "",
      website: "",
      locationAddress: "",
    },
  })

  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(null)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="New Business" />
        <PickDevUserEmptyState pageName="businesses" />
      </div>
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      const id: Id<"businesses"> = await createBusiness({
        name: values.name,
        category: values.category,
        description: values.description || undefined,
        website: values.website || undefined,
        locationAddress: values.locationAddress || undefined,
        logoUrl: logoUrl ?? undefined,
        coverImageUrl: coverImageUrl ?? undefined,
      })
      toast.success("Business created")
      router.push(`/dashboard/businesses/${id}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create business",
      )
    }
  }

  return (
    <div>
      <SiteHeader pageName="New Business" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/businesses">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <form onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Business name</FieldLabel>
                  <Input
                    id="name"
                    placeholder="Kinara Kitchen"
                    {...register("name")}
                  />
                  <FieldError errors={[errors.name]} />
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
                          <SelectItem value="restaurant">
                            Restaurant
                          </SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="fitness">Fitness</SelectItem>
                          <SelectItem value="tech">Tech</SelectItem>
                          <SelectItem value="service">Service</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.category]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="description">
                    Description{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Textarea
                    id="description"
                    rows={4}
                    placeholder="South Indian restaurant. Great for breakfast; filter coffee on tap."
                    {...register("description")}
                  />
                  <FieldError errors={[errors.description]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="website">
                    Website{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="website"
                    placeholder="https://example.com"
                    {...register("website")}
                  />
                  <FieldError errors={[errors.website]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="locationAddress">
                    Location{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="locationAddress"
                    placeholder="100ft Road, Indiranagar, Bangalore"
                    {...register("locationAddress")}
                  />
                </Field>

                <Field>
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

                <Field>
                  <FieldLabel>Cover image</FieldLabel>
                  <R2ImageUpload
                    value={coverImageUrl}
                    onChange={setCoverImageUrl}
                    kind="image"
                    label="Upload cover"
                    previewClassName="h-24 w-48"
                  />
                  <FieldDescription>
                    Wide banner for the business profile (16:9 works well).
                  </FieldDescription>
                </Field>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href="/dashboard/businesses">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      "Create business"
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
