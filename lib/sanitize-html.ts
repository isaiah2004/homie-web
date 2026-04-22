import DOMPurify from "isomorphic-dompurify"

// Shared config used server-side (Convex mutation) and client-side
// (message render). Defense in depth — the server sanitizes before
// insert, the client sanitizes again before `dangerouslySetInnerHTML`
// because a compromised server column would otherwise reach the DOM.
//
// Hooks are installed ONCE at module load (DOMPurify is a process-wide
// singleton — add/remove inside the sanitize function would race with
// any concurrent call and silently drop the wrong hook by name).

const ALLOWED_IFRAME_PREFIXES = [
  "https://www.youtube.com/embed/",
  "https://open.spotify.com/embed/",
]

// Fires AFTER attribute sanitization — setAttribute() here is not
// re-filtered, so target/rel survive. If we did this in
// `uponSanitizeElement` (which fires BEFORE attribute filtering) these
// values would be stripped by ALLOWED_URI_REGEXP and the reverse-
// tabnabbing defense would be silently broken.
DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
  // Text nodes don't have tagName; skip them.
  if (!node.tagName) return
  const tag = node.tagName.toLowerCase()
  if (tag === "a") {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer")
  }
})

// `uponSanitizeElement` is correct for outright removing nodes — it fires
// before attribute sanitization but removing here short-circuits the rest.
// Signature for this hook is (node, data, config) where data.tagName is
// the lowered tag; we just read from the node directly.
DOMPurify.addHook(
  "uponSanitizeElement",
  ((node: Element): void => {
    if (!node.tagName) return
    if (node.tagName.toLowerCase() !== "iframe") return
    const src = node.getAttribute("src") ?? ""
    const allowed = ALLOWED_IFRAME_PREFIXES.some((p) => src.startsWith(p))
    if (!allowed) {
      node.parentNode?.removeChild(node)
    }
  }) as never,
)

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "del",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "h1",
    "h2",
    "h3",
    "iframe",
    "img",
    "span",
    "hr",
  ],
  ALLOWED_ATTR: [
    "href",
    "target",
    "rel",
    "src",
    "width",
    "height",
    "allow",
    "allowfullscreen",
    "frameborder",
    "title",
    "loading",
    "alt",
    "class",
  ],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  FORBID_TAGS: ["script", "style"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
}

export function sanitizeMessageHtml(input: string): string {
  return DOMPurify.sanitize(input ?? "", SANITIZE_CONFIG) as string
}
