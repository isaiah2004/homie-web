"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  ImageIcon,
  Loader2Icon,
  TrashIcon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import {
  useIdentifiedAction,
  useIdentifiedMutation,
} from "@/hooks/use-identified"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type UploadKind = "image" | "video"

export type R2UploadProps = {
  // Controlled URL — host form owns the value. `null` / empty means "no upload yet".
  value: string | null
  onChange: (url: string | null) => void
  kind?: UploadKind
  label?: string
  // Forwarded to the <input accept> attribute; sensible defaults if omitted.
  accept?: string
  // Preview classes so callers can reshape the thumbnail (square, 16/9, etc.).
  previewClassName?: string
  disabled?: boolean
}

// Reads intrinsic image dimensions so the finalize mutation can store
// width/height. Non-image kinds resolve to `null` immediately. Mirrors the
// helper used in RichTextComposer — kept duplicated to avoid importing a
// chat-internal module from a generic form control.
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

// Single-file R2 uploader used by business / ad forms. Uses the same
// action+mutation pair as the chat composer; surface is simpler because
// we only need one file at a time and no progress UI.
export function R2ImageUpload({
  value,
  onChange,
  kind = "image",
  label,
  accept,
  previewClassName,
  disabled,
}: R2UploadProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)

  // `input.showPicker()` is the modern, explicit way to open a file chooser
  // in response to a user click and is more reliable than `input.click()`
  // on a `display: none` element (some browsers and extensions silently
  // drop the user-activation flag for hidden inputs). Falls back to
  // `.click()` on older engines that don't implement showPicker.
  function openPicker() {
    const el = inputRef.current
    if (!el) return
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker()
        return
      } catch {
        // Some browsers throw if called outside a user gesture — fall
        // through to `.click()` which is slightly more permissive.
      }
    }
    el.click()
  }

  const generateUploadUrl = useIdentifiedAction(api.r2.generateUploadUrl)
  const finalizeUpload = useIdentifiedMutation(api.attachments.finalizeUpload)

  const acceptAttr =
    accept ?? (kind === "video" ? "video/mp4,video/quicktime,video/webm" : "image/*")

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const dims = kind === "image" ? await readImageDimensions(file) : null
      const { uploadUrl, publicUrl, key } = await generateUploadUrl({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      })
      // Single-shot fetch PUT — no progress bar (keep this component small).
      // If we ever need progress we'll share the XHR helper from the chat composer.
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`)
      }
      await finalizeUpload({
        key,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        width: dims?.width,
        height: dims?.height,
      })
      onChange(publicUrl)
      toast.success(kind === "video" ? "Video uploaded" : "Image uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const Icon = kind === "video" ? VideoIcon : ImageIcon

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      {value ? (
        <div className="flex items-start gap-3">
          {kind === "video" ? (
            <video
              src={value}
              controls
              preload="metadata"
              className={cn(
                "h-24 w-40 rounded-md border bg-muted object-cover",
                previewClassName,
              )}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className={cn(
                "h-24 w-24 rounded-md border bg-muted object-cover",
                previewClassName,
              )}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={openPicker}
            >
              {uploading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <UploadIcon className="size-3.5" />
              )}
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
            >
              <TrashIcon className="size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={openPicker}
        >
          {uploading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <Icon className="size-3.5" />
          )}
          {label ?? (kind === "video" ? "Upload video" : "Upload image")}
        </Button>
      )}
    </div>
  )
}
