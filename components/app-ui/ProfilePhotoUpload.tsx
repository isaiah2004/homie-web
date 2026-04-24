"use client"

import * as React from "react"
import { toast } from "sonner"
import { CameraIcon, Loader2Icon, TrashIcon } from "lucide-react"

import { api } from "@/convex/_generated/api"
import { useActiveUser } from "@/hooks/use-active-user"
import {
  useIdentifiedAction,
  useIdentifiedMutation,
} from "@/hooks/use-identified"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

// <ProfilePhotoUpload /> — avatar display + upload button for the profile
// form. Uses the same R2 pipeline as DM attachments and community images:
//   1. `api.r2.generateUploadUrl` mints a presigned PUT URL
//   2. Browser PUTs the file directly to R2
//   3. `api.attachments.finalizeUpload` records the file (idempotent)
//   4. `api.users.setAvatar` writes the public URL to `users.avatar`
//
// Clerk's own `user.setProfileImage` is intentionally bypassed — our app
// reads `users.avatar` everywhere (friends lists, chat bubbles, nav,
// etc.), and Clerk's image upload was unreliable for some users. R2 gives
// us a stable URL we control. ConvexUserBootstrap now only backfills the
// Clerk imageUrl when `users.avatar` is empty so we never clobber an
// uploaded photo on subsequent sign-ins.
//
// Dev mode: `generateUploadUrl` accepts `devUserId` via `useIdentifiedAction`
// so the switcher's seeded user gets to upload too — nothing special here.

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — keep parity with Clerk's old cap.

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  return parts.map((s) => s[0]!.toUpperCase()).join("")
}

function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

type Props = {
  // Kept for API compatibility with the previous Clerk-based component.
  // When set, these seed the initial preview before `useActiveUser` loads
  // — useful for dev mode where no Clerk user is mounted.
  devAvatar?: string | null
  devName?: string | null
}

export function ProfilePhotoUpload({ devAvatar, devName }: Props) {
  const activeUser = useActiveUser()
  const generateUploadUrl = useIdentifiedAction(api.r2.generateUploadUrl)
  const finalizeUpload = useIdentifiedMutation(api.attachments.finalizeUpload)
  const setAvatar = useIdentifiedMutation(api.users.setAvatar)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)

  // Prefer the live activeUser values; fall back to the dev props the
  // host form passes in for the first render. This keeps the preview in
  // sync when `setAvatar` completes and `useActiveUser` re-fetches the
  // Convex row.
  const avatar = activeUser.avatar ?? devAvatar ?? null
  const name = activeUser.fullName ?? devName ?? null
  const canEdit = activeUser.isDevMode
    ? !!activeUser.devUserId
    : activeUser.isLoaded

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so the same file can be re-picked if upload fails.
    e.target.value = ""
    if (!file) return

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
      const dims = await readImageDimensions(file)
      const { uploadUrl, publicUrl, key } = await generateUploadUrl({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      })
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`)
      }
      // Finalize inserts the attachments row (also gives us server-side
      // size/type re-validation). We then write the public URL to the
      // users row so everywhere in the app picks it up.
      await finalizeUpload({
        key,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        width: dims?.width,
        height: dims?.height,
      })
      await setAvatar({ avatar: publicUrl })
      toast.success("Profile photo updated!")
    } catch (err) {
      console.error("ProfilePhotoUpload: failed", err)
      toast.error(
        err instanceof Error ? err.message : "Failed to update profile photo.",
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!confirm("Remove your profile photo?")) return
    setUploading(true)
    try {
      await setAvatar({ avatar: null })
      toast.success("Profile photo removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        {avatar ? <AvatarImage src={avatar} alt={name ?? "User avatar"} /> : null}
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
            disabled={!canEdit || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2Icon className="mr-1 size-4 animate-spin" />
            ) : (
              <CameraIcon className="mr-1 size-4" />
            )}
            {uploading ? "Uploading…" : "Change photo"}
          </Button>
          {avatar && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canEdit || uploading}
              onClick={handleRemove}
            >
              <TrashIcon className="mr-1 size-4" />
              Remove
            </Button>
          )}
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
