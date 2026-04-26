"use client"

import * as React from "react"

// Local-only BYOK store. Keys live in `localStorage` on the user's browser
// and are NEVER persisted server-side — they're sent over the wire as
// per-call args (see `convex/_lib/llmProvider.ts`) and discarded by the
// action after the upstream model returns.
//
// Sync model: same-tab updates broadcast a `homie:ai-keys` CustomEvent so
// every consumer (chat send paths, the AiKeysCard, etc.) sees the change
// immediately. Cross-tab sync rides on the native `storage` event.

export type LlmProvider = "gemini" | "minimax"

export type LocalAiKeys = {
  active: LlmProvider
  gemini?: string
  minimax?: string
  // For UI: when each key was last set. Stored alongside so the card can
  // show "updated 2h ago" without a separate read path.
  geminiUpdatedAt?: number
  minimaxUpdatedAt?: number
}

const STORAGE_KEY = "homie:aiKeys:v1"
const EVENT_NAME = "homie:ai-keys"

function emptyKeys(): LocalAiKeys {
  return { active: "gemini" }
}

function readKeys(): LocalAiKeys {
  if (typeof window === "undefined") return emptyKeys()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyKeys()
    const parsed = JSON.parse(raw) as Partial<LocalAiKeys>
    const active: LlmProvider =
      parsed.active === "minimax" ? "minimax" : "gemini"
    return {
      active,
      gemini: typeof parsed.gemini === "string" ? parsed.gemini : undefined,
      minimax:
        typeof parsed.minimax === "string" ? parsed.minimax : undefined,
      geminiUpdatedAt:
        typeof parsed.geminiUpdatedAt === "number"
          ? parsed.geminiUpdatedAt
          : undefined,
      minimaxUpdatedAt:
        typeof parsed.minimaxUpdatedAt === "number"
          ? parsed.minimaxUpdatedAt
          : undefined,
    }
  } catch {
    // Corrupt JSON or quota error — treat as empty rather than crashing the UI.
    return emptyKeys()
  }
}

function writeKeys(next: LocalAiKeys): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    // Notify same-tab subscribers; `storage` only fires across tabs.
    window.dispatchEvent(new CustomEvent(EVENT_NAME))
  } catch {
    // Best-effort — quota errors etc. are surfaced to the user via the
    // calling toast in the AiKeysCard.
  }
}

// Synchronous read for non-React code paths (e.g. chat send handlers that
// need the active credentials at the moment of send, not at render time).
export function readActiveCredentials():
  | { provider: LlmProvider; apiKey: string }
  | null {
  const k = readKeys()
  const apiKey = k.active === "gemini" ? k.gemini : k.minimax
  if (!apiKey) return null
  return { provider: k.active, apiKey }
}

export function useLocalAiKeys() {
  const [keys, setKeys] = React.useState<LocalAiKeys>(emptyKeys)

  React.useEffect(() => {
    // Read on mount (deferred from the initializer so SSR + hydration agree
    // on the empty default first, then we hydrate from localStorage).
    setKeys(readKeys())
    const refresh = () => setKeys(readKeys())
    window.addEventListener(EVENT_NAME, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(EVENT_NAME, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const setKey = React.useCallback(
    (provider: LlmProvider, key: string) => {
      const trimmed = key.trim()
      if (!trimmed) return
      const next: LocalAiKeys = {
        ...readKeys(),
        [provider]: trimmed,
        [`${provider}UpdatedAt`]: Date.now(),
      }
      writeKeys(next)
    },
    [],
  )

  const clearKey = React.useCallback((provider: LlmProvider) => {
    const cur = readKeys()
    const next: LocalAiKeys = { ...cur }
    delete next[provider]
    delete next[`${provider}UpdatedAt`]
    // If we cleared the active provider AND the other one has a key, flip
    // active to it so the next chat send doesn't fail.
    if (cur.active === provider) {
      const other: LlmProvider = provider === "gemini" ? "minimax" : "gemini"
      if (next[other]) next.active = other
    }
    writeKeys(next)
    return next.active
  }, [])

  const setActive = React.useCallback((provider: LlmProvider) => {
    const cur = readKeys()
    const hasKey = provider === "gemini" ? Boolean(cur.gemini) : Boolean(cur.minimax)
    if (!hasKey) {
      throw new Error(`Add a ${provider} key before switching to it.`)
    }
    writeKeys({ ...cur, active: provider })
  }, [])

  // Convenience for chat send paths.
  const getActiveCredentials = React.useCallback(() => {
    return readActiveCredentials()
  }, [])

  return { keys, setKey, clearKey, setActive, getActiveCredentials }
}
