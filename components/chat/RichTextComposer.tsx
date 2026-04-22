"use client"

import * as React from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import {
  useIdentifiedAction,
  useIdentifiedMutation,
} from "@/hooks/use-identified"
import { toast } from "sonner"
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  ListIcon,
  ListOrderedIcon,
  LinkIcon,
  PaperclipIcon,
  SendIcon,
  SparklesIcon,
  XIcon,
  FileIcon,
  ImageIcon,
  VideoIcon,
  Loader2Icon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ACCEPTED_MIME_FOR_FILE_INPUT } from "@/convex/lib/mime"

// Mention detection: we support the new `@homie` token and keep `@agent`
// for backward compatibility with messages composed before PR #2.
const HOMIE_MENTION = /(@homie|@agent)\b/i

type AttachmentKind = "image" | "video" | "pdf" | "doc" | "other"

type PendingAttachment = {
  localId: string
  fileName: string
  contentType: string
  size: number
  progress: number
  status: "uploading" | "ready" | "error"
  error?: string
  attachmentId?: Id<"attachments">
  kind?: AttachmentKind
  previewUrl?: string
}

export type RichTextComposerProps = {
  viewerId: Id<"users">
  placeholder?: string
  onSend: (payload: {
    html: string
    plainText: string
    attachmentIds: Id<"attachments">[]
    mentionsHomie: boolean
  }) => Promise<void>
  disabled?: boolean
  // Reserved for PR #3 — the composer surfaces a reply banner above the
  // editor when this is provided.
  replyModeIndicator?: React.ReactNode
  // Fires whenever the mention state changes so the chat page can show a
  // "this will be sent privately" banner without re-parsing the HTML.
  onMentionChange?: (m: boolean) => void
  // Reserved for PR #3 — mention-autocomplete-specific key handling.
  onTabKey?: () => void
}

// Classify a file client-side for the chip icon. The server re-classifies
// on finalize so this is purely cosmetic.
function quickKind(contentType: string): AttachmentKind {
  if (contentType.startsWith("image/")) return "image"
  if (contentType.startsWith("video/")) return "video"
  if (contentType === "application/pdf") return "pdf"
  if (
    contentType.startsWith("application/msword") ||
    contentType.startsWith("application/vnd.openxmlformats-officedocument") ||
    contentType === "text/plain"
  ) {
    return "doc"
  }
  return "other"
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Read intrinsic width/height for images so we can store them with the
// attachment row. Rejects on decode failure so we don't hang the upload.
function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

// XHR-based PUT so we can surface progress. fetch() doesn't expose an
// upload progress stream in browsers. Returns a handle with `.abort()`
// so the caller can cancel the transfer on unmount.
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

export function RichTextComposer({
  viewerId,
  placeholder = "Message…  (tag @homie to ask privately)",
  onSend,
  disabled,
  replyModeIndicator,
  onMentionChange,
  onTabKey,
}: RichTextComposerProps) {
  // R2 upload endpoints are now authenticated via `resolveIdentity` —
  // we let useIdentified* auto-inject `devUserId` from the active user.
  // That means the server, not the client, decides what user is
  // uploading. `viewerId` is still used for UI affordances (chip
  // grouping etc.) but is no longer trusted as an owner identifier.
  const generateUploadUrl = useIdentifiedAction(api.r2.generateUploadUrl)
  const finalizeUpload = useIdentifiedMutation(api.attachments.finalizeUpload)

  const [pending, setPending] = React.useState<PendingAttachment[]>([])
  const pendingRef = React.useRef<PendingAttachment[]>([])
  pendingRef.current = pending

  const [mentionsHomie, setMentionsHomie] = React.useState(false)
  const [hasText, setHasText] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // Track in-flight XHRs so we can abort them on unmount / error. Also
  // track blob URLs to revoke on unmount + send so we don't leak them.
  const activeUploadsRef = React.useRef<Map<string, UploadHandle>>(new Map())

  const editor = useEditor({
    extensions: [
      // StarterKit v3 already bundles the Link extension; configure it
      // through the `link` key rather than importing Link separately,
      // otherwise we end up registering two Link extensions and our
      // HTMLAttributes overrides can be silently dropped.
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "outline-none min-h-[56px] max-h-52 overflow-y-auto px-3 py-2 text-sm prose prose-sm dark:prose-invert prose-p:my-0 prose-ul:my-1 prose-ol:my-1 max-w-none",
      },
      handleKeyDown(_view, event) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          void handleSendRef.current()
          return true
        }
        if (event.key === "Tab" && onTabKey && mentionsHomie) {
          event.preventDefault()
          onTabKey()
          return true
        }
        return false
      },
    },
    onUpdate({ editor }) {
      const text = editor.getText()
      const trimmed = !!text.trim()
      setHasText(trimmed)
      const m = HOMIE_MENTION.test(text)
      setMentionsHomie(m)
      onMentionChange?.(m)
    },
    immediatelyRender: false,
  })

  // Ensure we don't leak the editor instance, in-flight XHRs, or object
  // URLs between mounts.
  React.useEffect(() => {
    return () => {
      editor?.destroy()
      for (const handle of activeUploadsRef.current.values()) {
        handle.abort()
      }
      activeUploadsRef.current.clear()
      for (const item of pendingRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadingCount = pending.filter((p) => p.status === "uploading").length
  const hasReadyAttachments = pending.some((p) => p.status === "ready")
  const canSend =
    !disabled && uploadingCount === 0 && (hasText || hasReadyAttachments)

  async function handleSend() {
    if (!editor) return
    if (!canSend) return

    const html = editor.getHTML()
    const plainText = editor.getText()
    const readyIds = pendingRef.current
      .filter((p) => p.status === "ready" && p.attachmentId)
      .map((p) => p.attachmentId!) as Id<"attachments">[]

    try {
      await onSend({
        html,
        plainText,
        attachmentIds: readyIds,
        mentionsHomie: HOMIE_MENTION.test(plainText),
      })
      editor.commands.clearContent()
      // Revoke every blob URL from the just-sent attachments so we don't
      // leak them over the lifetime of the page.
      for (const item of pendingRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
      setPending([])
      onMentionChange?.(false)
      setMentionsHomie(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    }
  }

  const handleSendRef = React.useRef(handleSend)
  handleSendRef.current = handleSend

  async function handleFilesPicked(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return
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
          let dims: { width: number; height: number } | null = null
          if (kind === "image") {
            dims = await readImageDimensions(file)
          }

          const { uploadUrl, key } = await generateUploadUrl({
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
                    attachmentId,
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
  }

  function removePending(localId: string) {
    // Abort any in-flight XHR for this attachment; revoke the blob URL.
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
  }

  if (!editor) {
    return (
      <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
        Loading composer…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {replyModeIndicator}
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pending.map((p) => (
            <AttachmentChip
              key={p.localId}
              item={p}
              onRemove={() => removePending(p.localId)}
            />
          ))}
        </div>
      )}
      <div
        className={cn(
          "rounded-md border bg-background overflow-hidden",
          disabled && "opacity-60",
        )}
      >
        <div className="flex items-center gap-0.5 border-b bg-muted/30 px-1 py-1 flex-wrap">
          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <BoldIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Strike"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <StrikethroughIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Code"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <CodeIcon className="size-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <ListIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Ordered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrderedIcon className="size-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            label="Link"
            active={editor.isActive("link")}
            onClick={() => {
              const prev = editor.getAttributes("link").href as
                | string
                | undefined
              const url = window.prompt("Link URL", prev ?? "https://")
              if (url === null) return
              if (url === "") {
                editor.chain().focus().extendMarkRange("link").unsetLink().run()
                return
              }
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run()
            }}
          >
            <LinkIcon className="size-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            label="Attach"
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon className="size-3.5" />
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_MIME_FOR_FILE_INPUT}
            className="hidden"
            onChange={(e) => {
              handleFilesPicked(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="flex items-center justify-end gap-2">
        {uploadingCount > 0 && (
          <span className="mr-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Uploading {uploadingCount} file{uploadingCount === 1 ? "" : "s"}…
          </span>
        )}
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!canSend}
        >
          {mentionsHomie ? (
            <>
              <SparklesIcon className="size-3.5" />
              Ask @homie
            </>
          ) : (
            <>
              <SendIcon className="size-3.5" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function AttachmentChip({
  item,
  onRemove,
}: {
  item: PendingAttachment
  onRemove: () => void
}) {
  const isImage = item.kind === "image"
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs",
        item.status === "error" && "border-destructive/50 bg-destructive/10",
      )}
    >
      {isImage && item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.previewUrl}
          alt={item.fileName}
          className="size-8 rounded object-cover"
        />
      ) : (
        <div className="flex size-8 items-center justify-center rounded bg-background">
          {item.kind === "video" ? (
            <VideoIcon className="size-4 text-muted-foreground" />
          ) : item.kind === "image" ? (
            <ImageIcon className="size-4 text-muted-foreground" />
          ) : (
            <FileIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="min-w-0 max-w-[160px]">
        <p className="truncate font-medium">{item.fileName}</p>
        <p className="text-[10px] text-muted-foreground">
          {item.status === "uploading"
            ? `Uploading ${item.progress}%`
            : item.status === "error"
              ? item.error ?? "Upload failed"
              : formatBytes(item.size)}
        </p>
        {item.status === "uploading" && (
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-background">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="ml-1 rounded p-0.5 text-muted-foreground opacity-70 hover:bg-background hover:text-foreground hover:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
