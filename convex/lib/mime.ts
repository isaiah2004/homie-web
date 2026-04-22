// Runtime-agnostic mime classification helper. Importable from both Node
// (`convex/r2.ts`) and the default Convex runtime (`convex/attachments.ts`)
// because it has no runtime-specific imports and no "use node" directive.

export type AttachmentKind = "image" | "video" | "pdf" | "doc" | "other"

export const MIME_RULES: Array<{
  match: RegExp | string
  kind: AttachmentKind
  maxSize: number
}> = [
  { match: /^image\//, kind: "image", maxSize: 25 * 1024 * 1024 },
  { match: "video/mp4", kind: "video", maxSize: 200 * 1024 * 1024 },
  { match: "video/quicktime", kind: "video", maxSize: 200 * 1024 * 1024 },
  { match: "video/webm", kind: "video", maxSize: 200 * 1024 * 1024 },
  { match: "application/pdf", kind: "pdf", maxSize: 50 * 1024 * 1024 },
  {
    match: "application/msword",
    kind: "doc",
    maxSize: 50 * 1024 * 1024,
  },
  {
    match:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "doc",
    maxSize: 50 * 1024 * 1024,
  },
  {
    match:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "doc",
    maxSize: 50 * 1024 * 1024,
  },
  {
    match:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "doc",
    maxSize: 50 * 1024 * 1024,
  },
  { match: "text/plain", kind: "doc", maxSize: 50 * 1024 * 1024 },
]

export function classifyMime(
  contentType: string,
): { kind: AttachmentKind; maxSize: number } | null {
  for (const rule of MIME_RULES) {
    if (
      typeof rule.match === "string"
        ? rule.match === contentType
        : rule.match.test(contentType)
    ) {
      return { kind: rule.kind, maxSize: rule.maxSize }
    }
  }
  return null
}

// Accept attribute value for <input type="file"> on the client.
export const ACCEPTED_MIME_FOR_FILE_INPUT = [
  "image/*",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
].join(",")
