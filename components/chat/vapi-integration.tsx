"use client"

import { useEffect, useRef, useState } from "react"
import Vapi from "@vapi-ai/web"

interface VapiConfig {
  apiKey: string
  assistantId?: string
}

interface VapiIntegrationProps {
  config: VapiConfig
  onTranscript: (transcript: string, role: "user" | "assistant") => void
  onCallStart: () => void
  onCallEnd: () => void
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

  const vapiRef = useRef<any>(null)
  // Callbacks are pinned in refs so the init effect can stay mounted for
  // the lifetime of the component instead of tearing down on every render.
  const onCallStartRef = useRef(onCallStart)
  const onCallEndRef = useRef(onCallEnd)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onCallStartRef.current = onCallStart
    onCallEndRef.current = onCallEnd
    onTranscriptRef.current = onTranscript
  })

  useEffect(() => {
    if (!config.apiKey) return
    let vapi: any
    try {
      vapi = new Vapi(config.apiKey)
      vapiRef.current = vapi

      vapi.on("call-start", () => {
        setIsCallActive(true)
        setLiveTranscript({ user: "", assistant: "" })
        setActiveToolCalls([])
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
          const names: string[] =
            msg.toolCallList?.map((t: any) => t?.name ?? t?.function?.name).filter(Boolean) ??
            msg.toolWithToolCallList?.map((t: any) => t?.function?.name ?? t?.name).filter(Boolean) ??
            []
          if (names.length) setActiveToolCalls((prev) => [...prev, ...names])
          return
        }
        if (msg?.type === "tool-calls-result" || msg?.type === "tool-call-result") {
          setActiveToolCalls([])
          return
        }
      })

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
      } catch {}
      vapiRef.current = null
      setIsInitialized(false)
    }
  }, [config.apiKey])

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
    startCall,
    stopCall,
    sendTextMessage,
  }
}
