// Shape of a persisted tool part. Mirrors `conversationMessages.parts`
// (see convex/schema.ts). The AI-SDK-style UIMessage part on the wire uses
// typed strings like "tool-findFriendsWithSharedMedia"; we also persist
// the bare `toolName` for simpler switch-based rendering.

export type PersistedPart = {
  type: string
  text?: string
  toolName?: string
  toolCallId?: string
  input?: string
  output?: string
  state?: "input-available" | "output-available" | "output-error"
  errorText?: string
}

// Parse `output` (JSON-stringified by the server). Returns `null` when
// parsing fails so the renderer can fall through to a fallback state.
export function parseToolOutput<T = unknown>(output?: string): T | null {
  if (!output) return null
  try {
    return JSON.parse(output) as T
  } catch {
    return null
  }
}

export function parseToolInput<T = unknown>(input?: string): T | null {
  return parseToolOutput<T>(input)
}
