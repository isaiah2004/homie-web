"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Vapi from "@vapi-ai/web"
import { useAction } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { PersistedPart } from "@/components/chat/tool-cards/types"

import {
  adaptSearchHits,
  buildHandleToolCallArgs,
  makeCompletedToolPart,
  makeErrorToolPart,
  makePendingToolPart,
  normaliseVapiToolCalls,
  type NormalisedVapiCall,
  type RawSearchHit,
} from "./voice-tool-parts"

interface VapiConfig {
  apiKey: string
  assistantId?: string
}

interface VapiIntegrationProps {
  config: VapiConfig
  onTranscript: (transcript: string, role: "user" | "assistant") => void
  onCallStart: () => void
  onCallEnd: () => void
  // Optional: the Convex user id. When provided, we re-run each Vapi
  // `tool-calls` event's tools against our own Convex action so the UI can
  // render the same rich cards the text chat shows. If not provided, tool
  // output stays text-only (same as before this file grew rich-UI support).
  userId?: Id<"users"> | null
  // Called every time the list of voice tool parts changes — lets the
  // parent persist them to `conversationMessages.parts` so the saved
  // transcript reopens with cards intact.
  onToolPartsChange?: (parts: PersistedPart[]) => void
}

interface LiveTranscript {
  user: string
  assistant: string
}

export function useVapiIntegration({
  config,
  onTranscript,
  onCallStart,
  onCallEnd,
  userId,
  onToolPartsChange,
}: VapiIntegrationProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscript>({
    user: "",
    assistant: "",
  })
  const [activeToolCalls, setActiveToolCalls] = useState<string[]>([])
  // Rich-UI parts for the current call. Keyed by Vapi toolCallId so we can
  // transition a part from "input-available" → "output-available" in place
  // when the corresponding Convex action resolves. Order is preserved by
  // tracking insertion order in a ref.
  const [toolParts, setToolParts] = useState<PersistedPart[]>([])
  const toolPartOrderRef = useRef<string[]>([])
  const toolPartMapRef = useRef<Map<string, PersistedPart>>(new Map())
  // Tool calls we've already kicked off this call. Vapi occasionally re-
  // fires `tool-calls` with the same id mid-stream (e.g. mid-generation
  // updates) and we don't want to double-run the Convex action.
  const seenCallIdsRef = useRef<Set<string>>(new Set())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vapiRef = useRef<any>(null)
  // Callbacks are pinned in refs so the init effect can stay mounted for
  // the lifetime of the component instead of tearing down on every render.
  const onCallStartRef = useRef(onCallStart)
  const onCallEndRef = useRef(onCallEnd)
  const onTranscriptRef = useRef(onTranscript)
  const onToolPartsChangeRef = useRef(onToolPartsChange)
  const userIdRef = useRef<Id<"users"> | null | undefined>(userId)
  useEffect(() => {
    onCallStartRef.current = onCallStart
    onCallEndRef.current = onCallEnd
    onTranscriptRef.current = onTranscript
    onToolPartsChangeRef.current = onToolPartsChange
    userIdRef.current = userId
  })

  // Convex action that mirrors what the VAPI server webhook calls. Running
  // it directly from the browser lets us get the raw `SearchHit[]` in the
  // client, regardless of whether the assistant echoes `tool-calls-result`
  // events back down the websocket.
  const runToolCall = useAction(api.vapiHandler.handleToolCall)

  // Helper: rebuild the ordered parts array from the map. Called after
  // every mutation so the state the consumer sees is always in-order.
  const commitParts = useCallback(() => {
    const ordered = toolPartOrderRef.current
      .map((id) => toolPartMapRef.current.get(id))
      .filter((p): p is PersistedPart => !!p)
    setToolParts(ordered)
    onToolPartsChangeRef.current?.(ordered)
  }, [])

  const upsertPart = useCallback(
    (part: PersistedPart) => {
      const key = part.toolCallId
      if (!key) return
      if (!toolPartMapRef.current.has(key)) {
        toolPartOrderRef.current.push(key)
      }
      toolPartMapRef.current.set(key, part)
      commitParts()
    },
    [commitParts],
  )

  const resetParts = useCallback(() => {
    toolPartOrderRef.current = []
    toolPartMapRef.current = new Map()
    seenCallIdsRef.current = new Set()
    setToolParts([])
    onToolPartsChangeRef.current?.([])
  }, [])

  const executeVoiceToolCall = useCallback(
    async (call: NormalisedVapiCall) => {
      const uid = userIdRef.current
      if (!uid) return
      const args = buildHandleToolCallArgs(uid, call)
      if (!args) return
      upsertPart(makePendingToolPart(call))
      try {
        const hits = (await runToolCall(args)) as RawSearchHit[]
        const adapted = adaptSearchHits(call.name, hits)
        upsertPart(makeCompletedToolPart(call, adapted))
      } catch (err) {
        console.error("Voice tool call failed:", err)
        upsertPart(
          makeErrorToolPart(
            call,
            err instanceof Error ? err.message : "Tool call failed",
          ),
        )
      }
    },
    [runToolCall, upsertPart],
  )

  useEffect(() => {
    if (!config.apiKey) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vapi: any
    try {
      vapi = new Vapi(config.apiKey)
      vapiRef.current = vapi

      vapi.on("call-start", () => {
        setIsCallActive(true)
        setLiveTranscript({ user: "", assistant: "" })
        setActiveToolCalls([])
        resetParts()
        onCallStartRef.current?.()
      })

      vapi.on("call-end", () => {
        setIsCallActive(false)
        setVolume(0)
        setActiveToolCalls([])
        onCallEndRef.current?.()
      })

      vapi.on("volume-level", (vol: number) => {
        setVolume(vol)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vapi.on("message", (msg: any) => {
        if (msg?.type === "transcript") {
          const role: "user" | "assistant" = msg.role
          if (role !== "user" && role !== "assistant") return
          const text: string = msg.transcript ?? ""
          const isFinal = msg.transcriptType === "final"
          setLiveTranscript((prev) => ({ ...prev, [role]: text }))
          if (isFinal) onTranscriptRef.current?.(text, role)
          return
        }
        if (msg?.type === "tool-calls") {
          const calls = normaliseVapiToolCalls(msg)
          if (calls.length === 0) return
          const names = calls.map((c) => c.name)
          setActiveToolCalls((prev) => [...prev, ...names])
          for (const call of calls) {
            if (seenCallIdsRef.current.has(call.id)) continue
            seenCallIdsRef.current.add(call.id)
            // Kick off in parallel — each call flips its own part from
            // "input-available" to "output-available" when it settles.
            void executeVoiceToolCall(call)
          }
          return
        }
        if (
          msg?.type === "tool-calls-result" ||
          msg?.type === "tool-call-result"
        ) {
          // We source the result from our own Convex action rather than
          // trusting Vapi's echo, so just clear the "Searching…" spinner
          // label here. The rich parts keep their own per-card state.
          setActiveToolCalls([])
          return
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vapi.on("error", (err: any) => {
        console.error("Vapi error:", err)
        setError(err?.message || "An error occurred")
      })

      setIsInitialized(true)
    } catch (err) {
      console.error("Failed to initialize Vapi:", err)
      setError("Failed to initialize voice services")
    }

    return () => {
      try {
        vapi?.stop?.()
      } catch {
        // Ignore teardown errors — Vapi throws when stopping an already-
        // stopped instance.
      }
      vapiRef.current = null
      setIsInitialized(false)
    }
  }, [config.apiKey, executeVoiceToolCall, resetParts])

  const startCall = async (
    assistantId?: string,
    metadata?: Record<string, string>,
  ) => {
    if (!vapiRef.current) {
      setError("Voice service not initialized")
      return
    }
    try {
      setError(null)
      const assistant = assistantId || config.assistantId
      if (!assistant) {
        setError("No assistant configured")
        return
      }
      const overrides = metadata ? { metadata } : undefined
      await vapiRef.current.start(assistant, overrides)
    } catch (err) {
      console.error("Failed to start Vapi call:", err)
      setError("Failed to start voice call")
    }
  }

  const stopCall = async () => {
    if (vapiRef.current && isCallActive) {
      try {
        await vapiRef.current.stop()
      } catch (err) {
        console.error("Failed to stop Vapi call:", err)
        setError("Failed to stop voice call")
      }
    }
  }

  const sendTextMessage = async (message: string) => {
    if (vapiRef.current && isCallActive) {
      try {
        await vapiRef.current.send(message)
      } catch (err) {
        console.error("Failed to send message to Vapi:", err)
        setError("Failed to send voice message")
      }
    }
  }

  return {
    isInitialized,
    isCallActive,
    error,
    volume,
    liveTranscript,
    activeToolCalls,
    // Rich-UI parts — same shape the text chat persists on
    // `conversationMessages.parts` and feeds to `ToolPartRenderer`.
    toolParts,
    startCall,
    stopCall,
    sendTextMessage,
  }
}
