"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import { useIdentifiedMutation } from "@/hooks/use-identified"
import { PickDevUserEmptyState } from "@/components/dev/PickDevUserEmptyState"

import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

const MAX_OPTIONS = 8

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
  const createPoll = useIdentifiedMutation(api.communityPolls.createPoll)

  const [question, setQuestion] = React.useState("")
  const [options, setOptions] = React.useState<string[]>(["", ""])
  const [closesAt, setClosesAt] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <div>
        <SiteHeader pageName="New Poll" />
        <PickDevUserEmptyState pageName="communities" />
      </div>
    )
  }

  if (community === undefined || viewerData === undefined) {
    return (
      <div>
        <SiteHeader pageName="New Poll" />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (community === null || viewerData === null) {
    return (
      <div>
        <SiteHeader pageName="New Poll" />
        <NotAllowed />
      </div>
    )
  }

  const myRole = viewerData.myRole
  const canCreate = myRole === "moderator" || myRole === "admin"
  if (!canCreate) {
    return (
      <div>
        <SiteHeader pageName="New Poll" />
        <NotAllowed />
      </div>
    )
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return
    setOptions([...options, ""])
  }
  function removeOption(i: number) {
    if (options.length <= 2) return
    setOptions(options.filter((_, idx) => idx !== i))
  }
  function updateOption(i: number, value: string) {
    setOptions(options.map((o, idx) => (idx === i ? value : o)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!community) return
    const q = question.trim()
    if (q.length < 2) {
      toast.error("Question is too short")
      return
    }
    const cleaned = options.map((o) => o.trim()).filter((o) => o.length > 0)
    if (cleaned.length < 2) {
      toast.error("At least 2 options required")
      return
    }
    const closesTs = closesAt ? new Date(closesAt).getTime() : undefined
    if (closesTs !== undefined && closesTs < Date.now()) {
      toast.error("Close time must be in the future")
      return
    }
    setSubmitting(true)
    try {
      await createPoll({
        communityId: community._id,
        question: q,
        options: cleaned,
        closesAt: closesTs,
      })
      toast.success("Poll created")
      router.push(`/dashboard/communities/${slug}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <SiteHeader pageName="New Poll" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href={`/dashboard/communities/${slug}`}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-base font-semibold">Create a poll</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Members of {community.name} can vote once per poll.
            </p>
            <form onSubmit={handleSubmit} className="mt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="question">Question</FieldLabel>
                  <Input
                    id="question"
                    placeholder="When should we move the weekly run?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Options</FieldLabel>
                  <div className="space-y-2">
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={(e) => updateOption(i, e.target.value)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeOption(i)}
                          disabled={options.length <= 2}
                        >
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    {options.length < MAX_OPTIONS && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addOption}
                      >
                        <PlusIcon className="size-3.5" />
                        Add option
                      </Button>
                    )}
                  </div>
                  <FieldDescription>
                    2-8 options. Leave blanks off — we strip empty entries.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="closesAt">
                    Closes{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="closesAt"
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                  />
                </Field>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" asChild>
                    <Link href={`/dashboard/communities/${slug}`}>
                      Cancel
                    </Link>
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      "Create poll"
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
          You need the moderator role (or higher) in this community.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/communities">Back to communities</Link>
        </Button>
      </div>
    </div>
  )
}
