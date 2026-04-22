import DOMPurify from "isomorphic-dompurify"

// Shared config used server-side (Convex mutation) and client-side
// (message render). Defense in depth — the server sanitizes before
// insert, the client sanitizes again before `dangerouslySetInnerHTML`
// because a compromised server column would otherwise reach the DOM.

const ALLOWED_IFRAME_PREFIXES = [
  "https://www.youtube.com/embed/",
  "https://open.spotify.com/embed/",
]

function afterSanitize(node: Element) {
  const tag = node.tagName?.toLowerCase()
  if (tag === "a") {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer")
  }
  if (tag === "iframe") {
    const src = node.getAttribute("src") ?? ""
    const allowed = ALLOWED_IFRAME_PREFIXES.some((p) => src.startsWith(p))
    if (!allowed) {
      node.parentNode?.removeChild(node)
    }
  }
}

export function sanitizeMessageHtml(input: string): string {
  const dirty = input ?? ""
  const hookName = "uponSanitizeElement"
  DOMPurify.addHook(hookName, afterSanitize as never)
  const clean = DOMPurify.sanitize(dirty, {
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
  }) as string
  DOMPurify.removeHook(hookName)
  return clean
}
