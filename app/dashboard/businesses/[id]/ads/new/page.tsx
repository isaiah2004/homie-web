"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
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
import { R2ImageUpload } from "@/components/app-ui/r2-image-upload"

const MAX_CAPTION_LEN = 2000

const formSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters"),
  subtitle: z.string().trim().optional().or(z.literal("")),
  caption: z
    .string()
    .trim()
    .min(1, "Caption is required")
    .max(MAX_CAPTION_LEN, "Caption is too long"),
  ctaLabel: z.string().trim().optional().or(z.literal("")),
  ctaUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  couponCode: z.string().trim().optional().or(z.literal("")),
  budgetPerWeek: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
})

type FormValues = z.infer<typeof formSchema>

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const businessId = params.id as Id<"businesses">

  const createAd = useIdentifiedMutation(api.ads.createAd)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      title: "",
      subtitle: "",
      caption: "",
      ctaLabel: "",
      ctaUrl: "",
      couponCode: "",
      budgetPerWeek: "",
    },
  })

  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null)

  const caption = watch("caption")
  const captionLen = (caption ?? "").length

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="New Ad" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="businesses" />
        </div>
      </PageShell>
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      // A `ctaLabel` without a `ctaUrl` (or vice versa) doesn't render
      // anything useful — short-circuit with a clear message rather than
      // letting the server accept a half-specified CTA.
      if (
        (values.ctaLabel && !values.ctaUrl) ||
        (!values.ctaLabel && values.ctaUrl)
      ) {
        toast.error("Provide both the CTA label and URL, or neither.")
        return
      }

      const budgetNum =
        values.budgetPerWeek && values.budgetPerWeek.trim()
          ? Number(values.budgetPerWeek)
          : undefined
      if (budgetNum !== undefined && Number.isNaN(budgetNum)) {
        toast.error("Budget must be a number")
        return
      }

      const id: Id<"ads"> = await createAd({
        businessId,
        title: values.title,
        subtitle: values.subtitle || undefined,
        caption: values.caption,
        ctaLabel: values.ctaLabel || undefined,
        ctaUrl: values.ctaUrl || undefined,
        couponCode: values.couponCode || undefined,
        imageUrl: imageUrl ?? undefined,
        videoUrl: videoUrl ?? undefined,
        budgetPerWeek: budgetNum,
      })
      toast.success("Ad saved as draft")
      router.push(`/dashboard/businesses/${businessId}/ads/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="New Ad" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/businesses/${businessId}/ads`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <form onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="title">Title</FieldLabel>
                  <Input
                    id="title"
                    placeholder="Weekend specials at Kinara"
                    {...register("title")}
                  />
                  <FieldError errors={[errors.title]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="subtitle">
                    Subtitle{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="subtitle"
                    placeholder="Sat & Sun · 10–2 pm"
                    {...register("subtitle")}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="caption">
                    Caption
                    <span className="ml-2 text-xs text-muted-foreground">
                      {captionLen}/{MAX_CAPTION_LEN}
                    </span>
                  </FieldLabel>
                  <Textarea
                    id="caption"
                    rows={6}
                    placeholder="Brunch is back. Sourdough dosa, cold-pressed coffee, and a view of 100ft Road…"
                    {...register("caption")}
                  />
                  <FieldError errors={[errors.caption]} />
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="ctaLabel">
                      CTA label{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id="ctaLabel"
                      placeholder="Reserve a table"
                      {...register("ctaLabel")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ctaUrl">
                      CTA URL{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id="ctaUrl"
                      placeholder="https://reservations.kinara.in"
                      {...register("ctaUrl")}
                    />
                    <FieldError errors={[errors.ctaUrl]} />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="couponCode">
                    Coupon code{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="couponCode"
                    placeholder="WEEKEND20"
                    {...register("couponCode")}
                  />
                  <FieldDescription>
                    Shown as a tappable chip in the ad.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Image</FieldLabel>
                  <R2ImageUpload
                    value={imageUrl}
                    onChange={setImageUrl}
                    kind="image"
                    label="Upload image"
                    previewClassName="h-24 w-40"
                  />
                </Field>

                <Field>
                  <FieldLabel>Video</FieldLabel>
                  <R2ImageUpload
                    value={videoUrl}
                    onChange={setVideoUrl}
                    kind="video"
                    label="Upload video"
                  />
                  <FieldDescription>
                    Optional. If both image and video are set, the video
                    takes precedence and the image becomes the poster.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="budgetPerWeek">
                    Weekly budget{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="budgetPerWeek"
                    type="number"
                    placeholder="2000"
                    {...register("budgetPerWeek")}
                  />
                  <FieldDescription>
                    Informational for now — enforcement ships with tracking
                    in PR #8.
                  </FieldDescription>
                </Field>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href={`/dashboard/businesses/${businessId}/ads`}>
                      Cancel
                    </Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save draft"
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
