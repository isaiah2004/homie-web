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
import { PageShell } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  AnnouncementComposer,
  type AnnouncementComposerHandle,
} from "@/components/app-ui/AnnouncementComposer"

const formSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters"),
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
    defaultValues: { title: "", pinned: false },
  })

  const composerRef = React.useRef<AnnouncementComposerHandle | null>(null)
  const [composerState, setComposerState] = React.useState<{
    hasBody: boolean
    attachmentsCount: number
    uploading: boolean
  }>({ hasBody: false, attachmentsCount: 0, uploading: false })

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="New Announcement" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="communities" />
        </div>
      </PageShell>
    )
  }

  if (community === undefined || viewerData === undefined) {
    return (
      <PageShell header={<SiteHeader pageName="New Announcement" />}>
        <div className="flex-1 overflow-auto">
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        </div>
      </PageShell>
    )
  }

  if (community === null || viewerData === null) {
    return (
      <PageShell header={<SiteHeader pageName="New Announcement" />}>
        <div className="flex-1 overflow-auto">
          <NotAllowed />
        </div>
      </PageShell>
    )
  }

  const { myRole } = viewerData
  const canAnnounce =
    myRole === "announcer" || myRole === "moderator" || myRole === "admin"
  if (!canAnnounce) {
    return (
      <PageShell header={<SiteHeader pageName="New Announcement" />}>
        <div className="flex-1 overflow-auto">
          <NotAllowed />
        </div>
      </PageShell>
    )
  }

  async function onSubmit(values: FormValues) {
    if (!community) return
    const snapshot = composerRef.current?.getState()
    if (!snapshot) return
    const plainText = snapshot.plainText.trim()
    const hasAttachments = snapshot.attachments.length > 0
    if (plainText.length === 0 && !hasAttachments) {
      toast.error("Write a body or attach at least one file.")
      return
    }
    if (composerState.uploading) {
      toast.error("Wait for uploads to finish.")
      return
    }
    try {
      await postAnnouncement({
        communityId: community._id,
        title: values.title,
        // Always send the composer's HTML. Server accepts either format
        // but we tag it explicitly so render-time picks the sanitizer.
        body: snapshot.html,
        format: "html",
        attachments:
          snapshot.attachments.length > 0 ? snapshot.attachments : undefined,
        pinned: values.pinned,
      })
      toast.success("Announcement posted")
      router.push(`/dashboard/communities/${slug}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  const canSubmit =
    !isSubmitting &&
    !composerState.uploading &&
    (composerState.hasBody || composerState.attachmentsCount > 0)

  return (
    <PageShell header={<SiteHeader pageName="New Announcement" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
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
                  <FieldLabel>Body</FieldLabel>
                  <AnnouncementComposer
                    ref={composerRef}
                    placeholder={"Write your announcement. Use the attach button to include images, videos, or files."}
                    onChange={(s) =>
                      setComposerState({
                        hasBody: s.plainText.trim().length > 0,
                        attachmentsCount: s.attachments.length,
                        uploading: s.uploading,
                      })
                    }
                  />
                  <FieldDescription>
                    Formatting: bold, italics, links, and lists. Images,
                    videos, and files upload to the community feed.
                  </FieldDescription>
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
                  <Button type="submit" disabled={!canSubmit}>
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
    </PageShell>
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
