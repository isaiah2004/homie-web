"use client"

import { useEffect, useRef, useState } from "react"
import Vapi from "@vapi-ai/web"

interface VapiConfig {
  apiKey: string
  assistantId?: string
}

interface VapiIntegrationProps {
  config: VapiConfig
  onTranscript: (transcript: string) => void
  onCallStart: () => void
  onCallEnd: () => void
  isActive: boolean
}

export function useVapiIntegration({
  config,
  onTranscript,
  onCallStart,
  onCallEnd,
  isActive,
}: VapiIntegrationProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vapiRef = useRef<any>(null)

  useEffect(() => {
    // Initialize Vapi
    if (!isInitialized && config.apiKey) {
      try {
        vapiRef.current = new Vapi(config.apiKey)
        
        // Set up event listeners
        vapiRef.current.on("call-start", () => {
          console.log("Vapi call started")
          setIsCallActive(true)
          onCallStart()
        })

        vapiRef.current.on("call-end", () => {
          console.log("Vapi call ended")
          setIsCallActive(false)
          onCallEnd()
        })

        vapiRef.current.on("speech", (speech: any) => {
          if (speech.type === "transcript") {
            onTranscript(speech.transcript)
          }
        })

        vapiRef.current.on("error", (error: any) => {
          console.error("Vapi error:", error)
          setError(error.message || "An error occurred")
        })

        setIsInitialized(true)
      } catch (err) {
        console.error("Failed to initialize Vapi:", err)
        setError("Failed to initialize voice services")
      }
    }

    return () => {
      if (vapiRef.current && isCallActive) {
        vapiRef.current.stop()
      }
    }
  }, [config.apiKey, isInitialized, onCallStart, onCallEnd, onTranscript])

  const startCall = async (assistantId?: string) => {
    if (!vapiRef.current) {
      setError("Voice service not initialized")
      return
    }

    try {
      setError(null)
      const assistant = assistantId || config.assistantId
      
      if (!assistant) {
        // Create a default assistant if none provided
        const assistantConfig = {
          name: "Homie Assistant",
          model: {
            provider: "openai",
            model: "gpt-3.5-turbo",
            temperature: 0.7,
          },
          voice: {
            provider: "elevenlabs",
            voiceId: "rachel",
          },
          firstMessage: "Hello! I'm your voice assistant. How can I help you today?",
        }
        
        await vapiRef.current.start(assistantConfig)
      } else {
        await vapiRef.current.start(assistant)
      }
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

  // Auto-start/stop based on isActive prop
  useEffect(() => {
    if (isActive && !isCallActive && isInitialized) {
      startCall()
    } else if (!isActive && isCallActive) {
      stopCall()
    }
  }, [isActive, isCallActive, isInitialized])

  return {
    isInitialized,
    isCallActive,
    error,
    startCall,
    stopCall,
    sendTextMessage,
  }
}

// Component for voice controls
export function VoiceControls({
  isActive,
  onToggle,
  isCallActive,
  error,
}: {
  isActive: boolean
  onToggle: () => void
  isCallActive: boolean
  error: string | null
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onToggle}
        className={`
          relative p-4 rounded-full transition-all duration-200
          ${isActive 
            ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
            : 'bg-green-500 hover:bg-green-600 text-white'
          }
        `}
      >
        <div className="h-6 w-6" />
        <div className="absolute inset-0 flex items-center justify-center">
          {isActive ? (
            <div className="h-8 w-8 rounded-full bg-white/30 animate-ping" />
          ) : null}
        </div>
      </button>
      
      <div className="text-center">
        <p className="text-sm font-medium">
          {isActive ? "Voice Active" : "Voice Inactive"}
        </p>
        {isCallActive && (
          <p className="text-xs text-green-600 animate-pulse">
            Connected to voice assistant
          </p>
        )}
        {error && (
          <p className="text-xs text-red-500 mt-1">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
