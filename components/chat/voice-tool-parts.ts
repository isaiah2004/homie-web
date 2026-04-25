// Adapter for surfacing VAPI voice-chat tool calls as rich UI cards.
//
// The normal text-chat path stores each tool call as a `PersistedPart` on
// `conversationMessages.parts`, and `ToolPartRenderer` dispatches on
// `toolName` to the right React card. Voice chat never went through that
// renderer — it only rendered plain transcript text — so even though Vapi
// fires `tool-calls` events, the result never made it into the UI.
//
// To fix without duplicating card code, we:
//   1. Listen for `tool-calls` on the Vapi client, and for each call on our
//      allowlist run the SAME Convex action the webhook uses
//      (`api.vapiHandler.handleToolCall`) directly from the browser. That
//      guarantees we have the result payload regardless of whether Vapi
//      echoes `tool-calls-result` events back down the websocket (it does
//      for some configurations, nothing for others — relying on it is
//      flaky).
//   2. Adapt the raw `SearchHit[]` the webhook returns into the reshaped
//      row objects the text-chat tool-cards expect (e.g. `ownerName` →
//      `recommendedBy`), so `ToolPartRenderer` can be reused verbatim.

import type { Id } from "@/convex/_generated/dataModel"
import type { PersistedPart } from "@/components/chat/tool-cards/types"

// Minimal shape of a raw `SearchHit` from convex/embeddings.ts. Only the
// fields we actually surface in cards.
export type RawSearchHit = {
  score?: number
  ownerId?: string
  ownerName?: string
  ownerLocation?: string
  name?: string
  placeType?: string
  mapsLink?: string
  address?: string
  tags?: string[]
  title?: string
  mediaType?: string
  imageUrl?: string
  subtitle?: string
  externalSource?: string
  description?: string
  value?: string
}

// Tool names the voice assistant is allowed to call. Mirrors the set in
// `convex/vapiHandler.ts → VALID_TOOLS`.
export const VOICE_TOOL_NAMES = new Set([
  "findFriendPlaces",
  "findFriendMedia",
  "findFriendProjects",
  "findFriendInterests",
])

// Normalise whatever Vapi sends in a `tool-calls` event into our internal
// list. Vapi has historically shipped two shapes — flat `toolCallList` and
// the newer `toolWithToolCallList` — so handle both the way the webhook
// does.
export type NormalisedVapiCall = {
  id: string
  name: string
  args: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseVapiToolCalls(msg: any): NormalisedVapiCall[] {
  const rawList: unknown[] =
    msg?.toolCallList ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    msg?.toolWithToolCallList?.map((t: any) => ({
      id: t?.toolCall?.id ?? t?.id,
      name: t?.function?.name ?? t?.name ?? t?.toolCall?.function?.name,
      arguments:
        t?.function?.arguments ??
        t?.arguments ??
        t?.toolCall?.function?.arguments ??
        {},
    })) ??
    []

  const out: NormalisedVapiCall[] = []
  for (const raw of rawList) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any
    const id: string | undefined = r?.id
    const name: string | undefined = r?.name ?? r?.function?.name
    if (!id || !name) continue
    const rawArgs = r?.function?.arguments ?? r?.arguments ?? {}
    let args: Record<string, unknown> = {}
    if (typeof rawArgs === "string") {
      try {
        args = JSON.parse(rawArgs)
      } catch {
        args = {}
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>
    }
    out.push({ id, name, args })
  }
  return out
}

// The webhook → `api.vapiHandler.handleToolCall` path returns raw
// `SearchHit[]`, but the text-chat tool-cards expect the per-tool reshaped
// rows (see `convex/agentTools.ts` executors). Re-apply the same reshaping
// here so we can feed the result into `ToolPartRenderer` without touching
// any card code.
export function adaptSearchHits(
  toolName: string,
  hits: RawSearchHit[],
): unknown {
  if (!Array.isArray(hits)) return []
  switch (toolName) {
    case "findFriendPlaces":
      return hits.map((h) => ({
        name: h.name,
        placeType: h.placeType,
        tags: h.tags,
        mapsLink: h.mapsLink,
        address: h.address,
        imageUrl: h.imageUrl,
        // `typeLabel` and `rating` come from the Places enrichment path the
        // text chat does — the voice webhook skips enrichment today, so we
        // leave them undefined. The card already tolerates that (falls back
        // to `placeType`).
        typeLabel: undefined,
        rating: undefined,
        recommendedBy: h.ownerName,
        ownerLocation: h.ownerLocation,
        score: h.score,
      }))
    case "findFriendMedia":
      return hits.map((h) => ({
        title: h.title,
        mediaType: h.mediaType,
        recommendedBy: h.ownerName,
        imageUrl: h.imageUrl,
        subtitle: h.subtitle,
        externalSource: h.externalSource,
        score: h.score,
      }))
    case "findFriendProjects":
      return hits.map((h) => ({
        title: h.title,
        description: h.description,
        tags: h.tags,
        ownerName: h.ownerName,
        score: h.score,
      }))
    case "findFriendInterests":
      return hits.map((h) => ({
        interest: h.value,
        ownerName: h.ownerName,
        score: h.score,
      }))
    default:
      return hits
  }
}

// Build a `PersistedPart` representing an in-flight tool call. The renderer
// shows a spinner for `state === "input-available"` until we flip it to
// `output-available`.
export function makePendingToolPart(
  call: NormalisedVapiCall,
): PersistedPart {
  return {
    type: `tool-${call.name}`,
    toolName: call.name,
    toolCallId: call.id,
    input: JSON.stringify(call.args),
    state: "input-available",
  }
}

export function makeCompletedToolPart(
  call: NormalisedVapiCall,
  output: unknown,
): PersistedPart {
  return {
    type: `tool-${call.name}`,
    toolName: call.name,
    toolCallId: call.id,
    input: JSON.stringify(call.args),
    output: JSON.stringify(output),
    state: "output-available",
  }
}

export function makeErrorToolPart(
  call: NormalisedVapiCall,
  errorText: string,
): PersistedPart {
  return {
    type: `tool-${call.name}`,
    toolName: call.name,
    toolCallId: call.id,
    input: JSON.stringify(call.args),
    state: "output-error",
    errorText,
  }
}

// Arg shape the Convex `handleToolCall` action accepts. Narrow-typed so TS
// catches typos — matches the validator in `convex/vapiHandler.ts`.
export type HandleToolCallArgs = {
  userId: Id<"users">
  toolName:
    | "findFriendPlaces"
    | "findFriendMedia"
    | "findFriendProjects"
    | "findFriendInterests"
  query: string
  closeOnly?: boolean
  limit?: number
  placeType?: string
  mediaType?: string
}

export function buildHandleToolCallArgs(
  userId: Id<"users">,
  call: NormalisedVapiCall,
): HandleToolCallArgs | null {
  if (!VOICE_TOOL_NAMES.has(call.name)) return null
  const a = call.args
  const query = typeof a.query === "string" ? a.query : ""
  return {
    userId,
    toolName: call.name as HandleToolCallArgs["toolName"],
    query,
    closeOnly: typeof a.closeOnly === "boolean" ? a.closeOnly : undefined,
    limit: typeof a.limit === "number" ? a.limit : undefined,
    placeType: typeof a.placeType === "string" ? a.placeType : undefined,
    mediaType: typeof a.mediaType === "string" ? a.mediaType : undefined,
  }
}
