"use client"

import * as React from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  ListIcon,
  ListOrderedIcon,
  LinkIcon,
  PaperclipIcon,
  XIcon,
  FileIcon,
  ImageIcon,
  VideoIcon,
  Loader2Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ACCEPTED_MIME_FOR_FILE_INPUT } from "@/convex/lib/mime"
import {
  useR2Upload,
  type PendingR2Attachment,
} from "@/hooks/use-r2-upload"

// <AnnouncementComposer /> — rich-text body + R2 attachment picker used by
// the community announcement form. Mirrors the look of the DM
// <RichTextComposer /> but owns no submit button — the host form (title +
// pin checkbox + submit) wraps it and reads the composed state on submit.
//
// Contract:
//   - `value` / `onChange` controls the body HTML. Parent typically keeps
//     this in react-hook-form state via a <Controller>.
//   - `attachments` are managed inside the hook; parent calls
//     `composerRef.current?.getState()` on submit to read
//     `{ html, plainText, attachments }`.
//   - `onReady` fires whenever upload state changes so the parent can
//     disable the submit button while any file is still uploading.

export type AnnouncementAttachment = {
  url: string
  contentType: string
  name: string
  size: number
}

export type AnnouncementComposerHandle = {
  getState: () => {
    html: string
    plainText: string
    attachments: AnnouncementAttachment[]
  }
  reset: () => void
}

export type AnnouncementComposerProps = {
  placeholder?: string
  disabled?: boolean
  // Initial body (HTML). Only read on first mount — callers that need to
  // re-seed should change the `key` prop.
  initialHtml?: string
  initialAttachments?: AnnouncementAttachment[]
  // Fires on every edit so parent forms can flag "dirty" state.
  onChange?: (state: {
    html: string
    plainText: string
    attachments: AnnouncementAttachment[]
    uploading: boolean
  }) => void
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export const AnnouncementComposer = React.forwardRef<
  AnnouncementComposerHandle,
  AnnouncementComposerProps
>(function AnnouncementComposer(
  { placeholder = "Write your announcement…", disabled, initialHtml, initialAttachments, onChange },
  ref,
) {
  const upload = useR2Upload({ initialAttachments })
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const editor = useEditor({
    extensions: [
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
    content: initialHtml ?? "",
    editorProps: {
      attributes: {
        class:
          "outline-none min-h-[120px] max-h-80 overflow-y-auto px-3 py-2 text-sm prose prose-sm dark:prose-invert prose-p:my-0 prose-ul:my-1 prose-ol:my-1 max-w-none",
      },
    },
    immediatelyRender: false,
  })

  // Forward state to the parent on every change. Wrapped in a ref so the
  // effect below doesn't need the caller to memoize `onChange`. The ref
  // is synced inside an effect (rather than during render) to keep
  // React's purity rules happy.
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const readyAttachments = upload.readyAttachments
  const uploadingCount = upload.uploadingCount

  React.useEffect(() => {
    if (!editor) return
    const emit = () => {
      onChangeRef.current?.({
        html: editor.getHTML(),
        plainText: editor.getText(),
        attachments: readyAttachments,
        uploading: uploadingCount > 0,
      })
    }
    editor.on("update", emit)
    // Initial emit covers attachments-only changes that happen outside
    // the editor's own update cycle.
    emit()
    return () => {
      editor.off("update", emit)
    }
  }, [editor, readyAttachments, uploadingCount])

  React.useImperativeHandle(
    ref,
    () => ({
      getState: () => ({
        html: editor?.getHTML() ?? "",
        plainText: editor?.getText() ?? "",
        attachments: upload.readyAttachments,
      }),
      reset: () => {
        editor?.commands.clearContent()
        upload.clear()
      },
    }),
    [editor, upload],
  )

  if (!editor) {
    return (
      <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
        Loading composer…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {upload.pending.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {upload.pending.map((p) => (
            <AttachmentChip
              key={p.localId}
              item={p}
              onRemove={() => upload.remove(p.localId)}
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
            onClick={() => toggleLink(editor)}
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
              void upload.uploadFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
        <EditorContent editor={editor} />
      </div>
      {uploadingCount > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          Uploading {uploadingCount} file{uploadingCount === 1 ? "" : "s"}…
        </p>
      )}
    </div>
  )
})

function toggleLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined
  const url = window.prompt("Link URL", prev ?? "https://")
  if (url === null) return
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
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
  item: PendingR2Attachment
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
              ? (item.error ?? "Upload failed")
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
