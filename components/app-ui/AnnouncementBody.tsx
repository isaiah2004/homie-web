"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { FileIcon, FileTextIcon } from "lucide-react"

import { sanitizeMessageHtml } from "@/lib/sanitize-html"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Shared renderer for a community announcement body + its R2 attachments.
// Used by the community detail feed and the chat <AnnouncementsCard />
// (and available to any future announcement surface). Mirrors the
// discriminator logic in <MessageContent /> — html bodies go through
// DOMPurify; markdown bodies go through react-markdown. Legacy rows with
// `format` absent render as markdown.

export type AnnouncementAttachment = {
  url: string
  contentType: string
  name: string
  size: number
}

export type AnnouncementBodyProps = {
  body: string
  format?: "markdown" | "html"
  attachments?: AnnouncementAttachment[]
  className?: string
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

type AttachmentKind = "image" | "video" | "pdf" | "doc" | "other"

function kindFromContentType(ct: string): AttachmentKind {
  if (ct.startsWith("image/")) return "image"
  if (ct.startsWith("video/")) return "video"
  if (ct === "application/pdf") return "pdf"
  if (
    ct.startsWith("application/msword") ||
    ct.startsWith("application/vnd.openxmlformats-officedocument") ||
    ct === "text/plain"
  )
    return "doc"
  return "other"
}

function AttachmentItem({ a }: { a: AnnouncementAttachment }) {
  const kind = kindFromContentType(a.contentType)
  if (kind === "image") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="block max-w-full overflow-hidden rounded-md border bg-background"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.name}
              loading="lazy"
              className="max-h-80 max-w-full object-contain"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm font-medium">
              {a.name}
            </DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt={a.name}
            className="mx-auto max-h-[80vh] w-auto max-w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    )
  }
  if (kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        className="max-h-80 max-w-full rounded-md border"
      >
        <source src={a.url} type={a.contentType} />
      </video>
    )
  }
  const Icon = kind === "pdf" || kind === "doc" ? FileTextIcon : FileIcon
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs",
        "hover:bg-muted/50",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate font-medium">{a.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatBytes(a.size)}
        </p>
      </div>
    </a>
  )
}

function AnnouncementAttachmentsGroup({
  attachments,
}: {
  attachments: AnnouncementAttachment[]
}) {
  if (!attachments || attachments.length === 0) return null
  const images = attachments.filter(
    (a) => kindFromContentType(a.contentType) === "image",
  )
  const rest = attachments.filter(
    (a) => kindFromContentType(a.contentType) !== "image",
  )
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div
          className={cn(
            "grid gap-1",
            images.length === 1
              ? "grid-cols-1"
              : images.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3",
          )}
        >
          {images.map((a, i) => (
            <AttachmentItem key={`${a.url}-${i}`} a={a} />
          ))}
        </div>
      )}
      {rest.map((a, i) => (
        <div key={`${a.url}-${i}`}>
          <AttachmentItem a={a} />
        </div>
      ))}
    </div>
  )
}

export function AnnouncementBody({
  body,
  format,
  attachments,
  className,
}: AnnouncementBodyProps) {
  let rendered: React.ReactNode
  if (format === "html") {
    const clean = sanitizeMessageHtml(body)
    rendered = (
      <div
        className="prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-a:underline prose-a:underline-offset-2"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    )
  } else {
    rendered = (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div className={className}>
      {rendered}
      {attachments && attachments.length > 0 && (
        <AnnouncementAttachmentsGroup attachments={attachments} />
      )}
    </div>
  )
}
