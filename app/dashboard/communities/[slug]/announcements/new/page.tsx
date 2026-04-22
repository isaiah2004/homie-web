"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { api } from "@/convex/_generated/api"
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

const formSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters"),
  body: z.string().trim().min(1, "Body is required"),
  pinned: z.boolean().optional(),
})

type FormValues = z.infer<typeof formSchema>

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const skip = activeUser.isDevMode
    ? !activeUser.devUserId
    : !activeUser.isLoaded
  const identityArg =
    activeUser.isDevMode && activeUser.devUserId
      ? { devUserId: activeUser.devUserId }
      : {}

  const community = useQuery(
    api.communities.getCommunityBySlug,
    skip ? "skip" : { slug },
  )
  const viewerData = useQuery(
    api.communities.getCommunityForViewer,
    skip || !community
      ? "skip"
      : { communityId: community._id, ...identityArg },
  )
  const postAnnouncement = useIdentifiedMutation(
    api.communityAnnouncements.postAnnouncement,
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any),
    defaultValues: { title: "", body: "", pinned: false },
  })

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="New Announcement" />
        <PickDevUserEmptyState pageName="communities" />
      </div>
    )
  }

  if (community === undefined || viewerData === undefined) {
    return (
      <div>
        <SiteHeader pageName="New Announcement" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (community === null || viewerData === null) {
    return (
      <div>
        <SiteHeader pageName="New Announcement" />
        <NotAllowed />
      </div>
    )
  }

  const { myRole } = viewerData
  const canAnnounce =
    myRole === "announcer" || myRole === "moderator" || myRole === "admin"
  if (!canAnnounce) {
    return (
      <div>
        <SiteHeader pageName="New Announcement" />
        <NotAllowed />
      </div>
    )
  }

  async function onSubmit(values: FormValues) {
    if (!community) return
    try {
      await postAnnouncement({
        communityId: community._id,
        title: values.title,
        body: values.body,
        pinned: values.pinned,
      })
      toast.success("Announcement posted")
      router.push(`/dashboard/communities/${slug}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  return (
    <div>
      <SiteHeader pageName="New Announcement" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/communities/${slug}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-base font-semibold">Post an announcement</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Everyone in {community.name} will be notified.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="title">Title</FieldLabel>
                  <Input
                    id="title"
                    placeholder="Weekly sunrise run is moving to 6am"
                    {...register("title")}
                  />
                  <FieldError errors={[errors.title]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="body">Body (markdown)</FieldLabel>
                  <Textarea
                    id="body"
                    rows={10}
                    placeholder={
                      "Hello! A few quick updates:\n\n- New time: **6am**\n- Meet at the East gate\n- Bring water"
                    }
                    {...register("body")}
                  />
                  <FieldDescription>
                    Markdown is supported. Headings, lists, bold/italic,
                    links, and tables all render.
                  </FieldDescription>
                  <FieldError errors={[errors.body]} />
                </Field>
                <Field>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border"
                      {...register("pinned")}
                    />
                    Pin to top
                  </label>
                </Field>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href={`/dashboard/communities/${slug}`}>
                      Cancel
                    </Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Posting…
                      </>
                    ) : (
                      "Post announcement"
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

function NotAllowed() {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Not allowed</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You need the announcer role (or higher) in this community.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/communities">Back to communities</Link>
        </Button>
      </div>
    </div>
  )
}
