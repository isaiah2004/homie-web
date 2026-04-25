"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { Label } from "@/components/ui/label"

// Default to the browser's IANA tz; falls back to America/New_York if Intl
// is somehow unavailable. Computed once per mount — we never want this to
// shift mid-form.
function browserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof tz === "string" && tz.length > 0) return tz
  } catch {
    // ignore
  }
  return "America/New_York"
}

export default function Page() {
  const activeUser = useActiveUser()
  const router = useRouter()
  const createChild = useIdentifiedMutation(api.family.createChildAccount)

  const [name, setName] = React.useState("")
  const [dob, setDob] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [timezone, setTimezone] = React.useState<string>(() =>
    browserTimezone(),
  )
  const [submitting, setSubmitting] = React.useState(false)

  if (activeUser.isDevMode && !activeUser.devUserId) {
    return (
      <PageShell header={<SiteHeader pageName="Add child" />}>
        <div className="flex-1 overflow-auto">
          <PickDevUserEmptyState pageName="family" />
        </div>
      </PageShell>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length < 1) {
      toast.error("Name is required")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      toast.error("DOB must be a valid date")
      return
    }
    setSubmitting(true)
    try {
      const res = await createChild({
        name: trimmedName,
        dob,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        timezone: timezone.trim() || undefined,
      })
      toast.success("Child account created")
      router.push(`/dashboard/family/${res.childId}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create child account",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell header={<SiteHeader pageName="Add child" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link href="/dashboard/family">
              <ArrowLeftIcon className="size-4" />
              Back
            </Link>
          </Button>
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-base font-semibold">Add a child account</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You become the primary parent. You can invite a co-parent or
              step-parent later.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Used to apply age-appropriate defaults. Must be under 18.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username (optional)</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="alex2014"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                />
                <p className="text-[11px] text-muted-foreground">
                  If provided, your child can claim the account via Clerk
                  magic link. Leave blank if you&apos;ll act on their behalf.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="America/New_York"
                />
                <p className="text-[11px] text-muted-foreground">
                  IANA timezone. Used by night-lock and audit log.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" asChild>
                  <Link href="/dashboard/family">Cancel</Link>
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create child account"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
