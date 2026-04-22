"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"
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

// ─────────────────────────────────────────────────────────────────────────────
// Embeds (YouTube / Spotify — unchanged from the previous component)
// ─────────────────────────────────────────────────────────────────────────────

const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/g

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/
const SPOTIFY_REGEX =
  /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode)\/([\w]+)/

function extractEmbed(url: string, key: string): React.ReactNode {
  const yt = url.match(YOUTUBE_REGEX)
  if (yt) {
    return (
      <iframe
        key={key}
        className="mt-2 w-full aspect-video rounded-md"
        src={`https://www.youtube.com/embed/${yt[1]}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="YouTube embed"
      />
    )
  }

  const spotify = url.match(SPOTIFY_REGEX)
  if (spotify) {
    return (
      <iframe
        key={key}
        className="mt-2 w-full rounded-md"
        style={{ height: spotify[1] === "track" ? 80 : 352 }}
        src={`https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`}
        allow="encrypted-media"
        title="Spotify embed"
      />
    )
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments
// ─────────────────────────────────────────────────────────────────────────────

type AttachmentKind = "image" | "video" | "pdf" | "doc" | "other"

type RenderableAttachment = {
  id: string
  kind: AttachmentKind
  fileName: string
  publicUrl: string
  contentType: string
  size: number
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentItem({ a }: { a: RenderableAttachment }) {
  if (a.kind === "image") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="block max-w-full overflow-hidden rounded-md border bg-background"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.publicUrl}
              alt={a.fileName}
              loading="lazy"
              className="max-h-80 max-w-full object-contain"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm font-medium">
              {a.fileName}
            </DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.publicUrl}
            alt={a.fileName}
            className="mx-auto max-h-[80vh] w-auto max-w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    )
  }

  if (a.kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        className="max-h-80 max-w-full rounded-md border"
      >
        <source src={a.publicUrl} type={a.contentType} />
      </video>
    )
  }

  // pdf | doc | other — file chip
  const Icon =
    a.kind === "pdf"
      ? FileTextIcon
      : a.kind === "doc"
        ? FileTextIcon
        : a.kind === "other"
          ? FileIcon
          : FileIcon

  return (
    <a
      href={a.publicUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs",
        "hover:bg-muted/50",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate font-medium">{a.fileName}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatBytes(a.size)}
        </p>
      </div>
    </a>
  )
}

function AttachmentGroup({
  attachments,
}: {
  attachments: RenderableAttachment[]
}) {
  if (attachments.length === 0) return null
  const images = attachments.filter((a) => a.kind === "image")
  const rest = attachments.filter((a) => a.kind !== "image")
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
          {images.map((a) => (
            <AttachmentItem key={a.id} a={a} />
          ))}
        </div>
      )}
      {rest.map((a) =>
        a.kind === "video" ? (
          <div key={a.id}>
            <AttachmentItem a={a} />
          </div>
        ) : (
          <div key={a.id}>
            <AttachmentItem a={a} />
          </div>
        ),
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown renderer (legacy + agent responses) — `rehypeRaw` removed to
// close the XSS hole it opened. HTML-format messages use the sanitizer path.
// ─────────────────────────────────────────────────────────────────────────────

function buildMarkdownComponents(isUser: boolean): Components {
  return {
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 break-all hover:opacity-80"
      >
        {children}
      </a>
    ),
    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => <em>{children}</em>,
    del: ({ children }) => <del className="opacity-70">{children}</del>,
    ul: ({ children }) => (
      <ul className="list-disc pl-4 mb-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-4 mb-1">{children}</ol>
    ),
    li: ({ children }) => <li className="mb-0.5">{children}</li>,
    h1: ({ children }) => (
      <p className="text-base font-bold mb-1">{children}</p>
    ),
    h2: ({ children }) => (
      <p className="text-base font-bold mb-1">{children}</p>
    ),
    h3: ({ children }) => (
      <p className="text-sm font-bold mb-1">{children}</p>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className={`border-l-2 pl-2 mb-1 opacity-80 ${
          isUser ? "border-primary-foreground/40" : "border-foreground/30"
        }`}
      >
        {children}
      </blockquote>
    ),
    code: ({ className, children }) => {
      const isBlock = className?.includes("language-")
      if (isBlock) {
        return (
          <pre
            className={`mt-1 mb-1 rounded-md p-2 text-xs overflow-x-auto ${
              isUser ? "bg-primary-foreground/10" : "bg-foreground/5"
            }`}
          >
            <code>{children}</code>
          </pre>
        )
      }
      return (
        <code
          className={`rounded px-1 py-0.5 text-xs ${
            isUser ? "bg-primary-foreground/15" : "bg-foreground/10"
          }`}
        >
          {children}
        </code>
      )
    },
    pre: ({ children }) => <>{children}</>,
    hr: () => (
      <hr
        className={`my-2 ${
          isUser ? "border-primary-foreground/20" : "border-foreground/10"
        }`}
      />
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-1">
        <table className="text-xs border-collapse w-full">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th
        className={`border px-2 py-1 text-left font-semibold ${
          isUser ? "border-primary-foreground/20" : "border-foreground/10"
        }`}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        className={`border px-2 py-1 ${
          isUser ? "border-primary-foreground/20" : "border-foreground/10"
        }`}
      >
        {children}
      </td>
    ),
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={typeof src === "string" ? src : undefined}
        alt={alt || ""}
        className="max-w-full rounded-md mt-1 mb-1"
        loading="lazy"
      />
    ),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export type MessageContentProps = {
  content: string
  format?: "plain" | "markdown" | "html"
  isUser: boolean
  attachments?: RenderableAttachment[]
}

export function MessageContent({
  content,
  format,
  isUser,
  attachments,
}: MessageContentProps) {
  const urls = React.useMemo(() => content.match(URL_REGEX) || [], [content])
  const embeds = React.useMemo(
    () =>
      urls
        .map((url, i) => extractEmbed(url, `embed-${i}`))
        .filter((n): n is React.ReactElement => n !== null),
    [urls],
  )

  const markdownComponents = React.useMemo(
    () => buildMarkdownComponents(isUser),
    [isUser],
  )

  let body: React.ReactNode

  if (format === "html") {
    const clean = sanitizeMessageHtml(content)
    body = (
      <div
        className="prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-a:underline prose-a:underline-offset-2"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    )
  } else {
    // `format === "markdown"`, `"plain"`, or undefined — all rendered
    // through react-markdown (plain text passes through markdown fine).
    body = (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    )
  }

  return (
    <div className="text-sm [&>*:first-child]:mt-0">
      {body}
      {embeds.length > 0 && <div className="space-y-2">{embeds}</div>}
      {attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </div>
  )
}
