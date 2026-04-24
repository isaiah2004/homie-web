"use client"

import * as React from "react"
import { toast } from "sonner"
import { CameraIcon, Loader2Icon } from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

// <ProfilePhotoUpload /> — avatar display + upload button for the profile form.
//
// Identity + photo hosting are owned by Clerk; Convex `users.avatar` just
// mirrors the Clerk `user.imageUrl` so friends lists / chat bubbles / etc.
// can read from Convex without a second round-trip. On upload we push the
// file through Clerk, wait for it to resolve, then call `getOrCreateUser`
// to re-mirror the new URL into Convex.
//
// Dev mode: Clerk isn't mounted, so we render a read-only avatar sourced
// from the seeded Convex row and a note explaining why editing is off.

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matches Clerk's default upload cap.

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  return parts.map((s) => s[0]!.toUpperCase()).join("")
}

type Props = {
  // Passed through in dev mode where Clerk isn't available.
  devAvatar?: string | null
  devName?: string | null
}

export function ProfilePhotoUpload({ devAvatar, devName }: Props) {
  if (isDevMode) {
    return <DevAvatar avatar={devAvatar} name={devName} />
  }
  return <ClerkAvatar />
}

function DevAvatar({
  avatar,
  name,
}: {
  avatar?: string | null
  name?: string | null
}) {
  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        {avatar ? (
          <AvatarImage src={avatar} alt={name ?? "User avatar"} />
        ) : null}
        <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-xs text-muted-foreground">
          Photo upload is disabled in dev mode.
        </p>
      </div>
    </div>
  )
}

function ClerkAvatar() {
  const { user, isLoaded } = useUser()
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const imageUrl = user?.imageUrl
  const name = user?.fullName ?? null
  const email = user?.primaryEmailAddress?.emailAddress

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so the same file can be re-picked if the upload fails.
    e.target.value = ""
    if (!file || !user || !email) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file.")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 5 MB.")
      return
    }

    setUploading(true)
    try {
      await user.setProfileImage({ file })
      // Clerk has updated; `user.imageUrl` now reflects the new CDN URL.
      // Mirror it into Convex so anywhere in the app that reads
      // `users.avatar` picks up the new photo without needing a separate
      // Clerk call.
      await getOrCreateUser({
        email,
        avatar: user.imageUrl || undefined,
      })
      toast.success("Profile photo updated!")
    } catch (err) {
      console.error("Failed to update profile photo", err)
      toast.error(
        err instanceof Error ? err.message : "Failed to update profile photo.",
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        {imageUrl ? (
          <AvatarImage src={imageUrl} alt={name ?? "User avatar"} />
        ) : null}
        <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, or GIF. Max 5 MB.
        </p>
        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isLoaded || !user || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2Icon className="mr-1 size-4 animate-spin" />
            ) : (
              <CameraIcon className="mr-1 size-4" />
            )}
            {uploading ? "Uploading…" : "Change photo"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFile}
        />
      </div>
    </div>
  )
}
