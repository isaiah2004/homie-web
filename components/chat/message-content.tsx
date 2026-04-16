"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import type { Components } from "react-markdown"

const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/g

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/
const SPOTIFY_REGEX =
  /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode)\/([\w]+)/
const TWITTER_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([\w]+)\/status\/(\d+)/

function extractEmbed(url: string) {
  const yt = url.match(YOUTUBE_REGEX)
  if (yt) {
    return (
      <iframe
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

interface MessageContentProps {
  content: string
  isUser: boolean
}

export function MessageContent({ content, isUser }: MessageContentProps) {
  // Collect embeds from URLs in the message
  const urls = content.match(URL_REGEX) || []
  const embeds = urls.map((url) => extractEmbed(url)).filter(Boolean)

  const components: Components = {
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
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    del: ({ children }) => <del className="opacity-70">{children}</del>,
    ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
    li: ({ children }) => <li className="mb-0.5">{children}</li>,
    h1: ({ children }) => <p className="text-base font-bold mb-1">{children}</p>,
    h2: ({ children }) => <p className="text-base font-bold mb-1">{children}</p>,
    h3: ({ children }) => <p className="text-sm font-bold mb-1">{children}</p>,
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
              isUser
                ? "bg-primary-foreground/10"
                : "bg-foreground/5"
            }`}
          >
            <code>{children}</code>
          </pre>
        )
      }
      return (
        <code
          className={`rounded px-1 py-0.5 text-xs ${
            isUser
              ? "bg-primary-foreground/15"
              : "bg-foreground/10"
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
      <img
        src={src}
        alt={alt || ""}
        className="max-w-full rounded-md mt-1 mb-1"
        loading="lazy"
      />
    ),
  }

  return (
    <div className="text-sm [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
      {embeds.length > 0 && <div className="space-y-2">{embeds}</div>}
    </div>
  )
}
