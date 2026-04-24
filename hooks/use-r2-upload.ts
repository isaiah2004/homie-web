"use client"

import * as React from "react"
import { toast } from "sonner"

import { api } from "@/convex/_generated/api"
import { useIdentifiedAction, useIdentifiedMutation } from "./use-identified"
import { classifyMime } from "@/convex/lib/mime"

// Shared R2 upload flow used by surfaces that need to attach files to a
// composed document (DM, community announcement, etc.):
//
//   1. `api.r2.generateUploadUrl` (action) mints a presigned PUT URL.
//   2. Browser PUTs the file directly to R2 with XHR so we can report
//      progress.
//   3. `api.attachments.finalizeUpload` (mutation) inserts the
//      `attachments` row with its server-derived `publicUrl`.
//
// The hook keeps a list of `PendingR2Attachment` rows (one per file the
// user has attached) and lets the host render chips / progress / remove
// buttons. On send, the host reads `.attachments` (the completed subset,
// shaped for an announcement-style inline list) or `.attachmentIds`
// (Convex ids, shaped for the DM flow) and passes them to its mutation.

export type R2AttachmentKind = "image" | "video" | "pdf" | "doc" | "other"

export type PendingR2Attachment = {
  localId: string
  fileName: string
  contentType: string
  size: number
  progress: number
  status: "uploading" | "ready" | "error"
  error?: string
  kind: R2AttachmentKind
  previewUrl?: string // blob: URL for image thumbnails only
  publicUrl?: string // R2 public URL once the PUT completes
  attachmentId?: string // attachments table id once finalize completes
  width?: number
  height?: number
}

type UploadHandle = { promise: Promise<void>; abort: () => void }

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    })
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Upload network error"))
    xhr.onabort = () => reject(new Error("Upload aborted"))
    xhr.send(file)
  })
  return { promise, abort: () => xhr.abort() }
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

function quickKind(contentType: string): R2AttachmentKind {
  const mime = classifyMime(contentType)
  return mime?.kind ?? "other"
}

export type UseR2UploadOptions = {
  // Pre-uploaded attachments seeded into the pending list on mount with
  // status "ready". Useful for edit flows where the host doc already has
  // files attached — the host passes `{ url, contentType, name, size }`
  // for each and the user can remove / add to the set without re-
  // uploading. Only read on initial mount; changing the value later is
  // ignored.
  initialAttachments?: Array<{
    url: string
    contentType: string
    name: string
    size: number
  }>
}

export function useR2Upload(options?: UseR2UploadOptions) {
  const generateUploadUrl = useIdentifiedAction(api.r2.generateUploadUrl)
  const finalizeUpload = useIdentifiedMutation(api.attachments.finalizeUpload)

  const initialAttachmentsRef = React.useRef(options?.initialAttachments)

  const [pending, setPending] = React.useState<PendingR2Attachment[]>(() => {
    const seed = initialAttachmentsRef.current
    if (!seed || seed.length === 0) return []
    return seed.map((a, i) => ({
      localId: `seed-${i}-${a.url}`,
      fileName: a.name,
      contentType: a.contentType,
      size: a.size,
      progress: 100,
      status: "ready" as const,
      kind: (() => {
        if (a.contentType.startsWith("image/")) return "image"
        if (a.contentType.startsWith("video/")) return "video"
        if (a.contentType === "application/pdf") return "pdf"
        if (
          a.contentType.startsWith("application/msword") ||
          a.contentType.startsWith(
            "application/vnd.openxmlformats-officedocument",
          ) ||
          a.contentType === "text/plain"
        )
          return "doc"
        return "other"
      })(),
      publicUrl: a.url,
      // No `attachmentId` because we don't round-trip back through
      // finalizeUpload — existing rows already own an `attachments` row.
      // Consumers that need the id shape won't see seeded entries in
      // `readyAttachmentIds`; that's intentional.
    }))
  })
  const pendingRef = React.useRef<PendingR2Attachment[]>(pending)
  pendingRef.current = pending

  // Keep in-flight XHRs around so we can abort them on unmount or remove.
  const activeUploadsRef = React.useRef<Map<string, UploadHandle>>(new Map())

  React.useEffect(() => {
    // Capture the map reference at mount so the cleanup closure doesn't
    // re-read `.current` after React has already torn down (which the
    // exhaustive-deps lint rule flags otherwise).
    const activeUploads = activeUploadsRef.current
    return () => {
      for (const handle of activeUploads.values()) handle.abort()
      activeUploads.clear()
      for (const item of pendingRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
    }
  }, [])

  const uploadingCount = pending.filter((p) => p.status === "uploading").length
  const readyCount = pending.filter((p) => p.status === "ready").length
  const hasFailed = pending.some((p) => p.status === "error")

  const uploadFiles = React.useCallback(
    async (filesList: FileList | File[] | null) => {
      if (!filesList) return
      const files = Array.from(filesList)
      for (const file of files) {
        const localId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `local-${Date.now()}-${Math.random()}`
        const kind = quickKind(file.type)
        const previewUrl =
          kind === "image" ? URL.createObjectURL(file) : undefined

        setPending((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            progress: 0,
            status: "uploading",
            kind,
            previewUrl,
          },
        ])

        ;(async () => {
          try {
            const dims = kind === "image" ? await readImageDimensions(file) : null

            const { uploadUrl, publicUrl, key } = await generateUploadUrl({
              fileName: file.name,
              contentType: file.type,
              size: file.size,
            })

            const handle = putWithProgress(uploadUrl, file, (pct) => {
              setPending((prev) =>
                prev.map((p) =>
                  p.localId === localId ? { ...p, progress: pct } : p,
                ),
              )
            })
            activeUploadsRef.current.set(localId, handle)
            try {
              await handle.promise
            } finally {
              activeUploadsRef.current.delete(localId)
            }

            const attachmentId = await finalizeUpload({
              key,
              fileName: file.name,
              contentType: file.type,
              size: file.size,
              width: dims?.width,
              height: dims?.height,
            })

            setPending((prev) =>
              prev.map((p) =>
                p.localId === localId
                  ? {
                      ...p,
                      status: "ready",
                      progress: 100,
                      publicUrl,
                      attachmentId,
                      width: dims?.width,
                      height: dims?.height,
                    }
                  : p,
              ),
            )
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Upload failed"
            toast.error(`Upload failed: ${msg}`)
            setPending((prev) =>
              prev.map((p) =>
                p.localId === localId
                  ? { ...p, status: "error", error: msg }
                  : p,
              ),
            )
          }
        })()
      }
    },
    [generateUploadUrl, finalizeUpload],
  )

  const remove = React.useCallback((localId: string) => {
    const handle = activeUploadsRef.current.get(localId)
    if (handle) {
      handle.abort()
      activeUploadsRef.current.delete(localId)
    }
    setPending((prev) => {
      const item = prev.find((p) => p.localId === localId)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((p) => p.localId !== localId)
    })
  }, [])

  const clear = React.useCallback(() => {
    for (const handle of activeUploadsRef.current.values()) handle.abort()
    activeUploadsRef.current.clear()
    for (const item of pendingRef.current) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
    setPending([])
  }, [])

  // Public-URL shape for inline storage on a host document (e.g. a
  // community announcement row). Only includes ready attachments.
  const readyAttachments = React.useMemo(
    () =>
      pending
        .filter(
          (
            p,
          ): p is PendingR2Attachment & {
            publicUrl: string
          } => p.status === "ready" && !!p.publicUrl,
        )
        .map((p) => ({
          url: p.publicUrl,
          contentType: p.contentType,
          name: p.fileName,
          size: p.size,
        })),
    [pending],
  )

  // Convex id shape for surfaces that store a foreign-key list (DM flow).
  const readyAttachmentIds = React.useMemo(
    () =>
      pending
        .filter(
          (p): p is PendingR2Attachment & { attachmentId: string } =>
            p.status === "ready" && !!p.attachmentId,
        )
        .map((p) => p.attachmentId),
    [pending],
  )

  return {
    pending,
    uploadFiles,
    remove,
    clear,
    uploadingCount,
    readyCount,
    hasFailed,
    readyAttachments,
    readyAttachmentIds,
  }
}
