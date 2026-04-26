"use client"

import * as React from "react"
import { useAction } from "convex/react"
import { toast } from "sonner"
import {
  CheckCircleIcon,
  KeyRoundIcon,
  AlertTriangleIcon,
  PlusIcon,
  TrashIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import {
  useLocalAiKeys,
  type LlmProvider,
} from "@/hooks/use-local-ai-keys"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  gemini: "Gemini",
  minimax: "MiniMax",
}

const PROVIDER_HELP: Record<LlmProvider, { url: string; hint: string }> = {
  gemini: {
    url: "https://aistudio.google.com/app/apikey",
    hint: "Free tier available — paste any Google AI Studio API key.",
  },
  minimax: {
    url: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    hint: "Use a MiniMax API key from the platform console (international site).",
  },
}

function timeAgo(t: number | undefined): string {
  if (!t) return "never"
  const diff = Date.now() - t
  if (diff < 60_000) return "just now"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function maskKey(key: string | undefined): string | null {
  if (!key) return null
  const trimmed = key.trim()
  if (trimmed.length <= 4) return "••••"
  return `••••${trimmed.slice(-4)}`
}

export function AiKeysCard() {
  const { keys, setKey, clearKey, setActive } = useLocalAiKeys()
  // testKey is stateless server-side — we just hit the upstream provider
  // with the typed-but-not-yet-saved key to confirm it works. Nothing is
  // stored on Convex.
  const testKey = useAction(api.userAiKeysTest.testKey)

  const [editing, setEditing] = React.useState<LlmProvider | null>(null)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState<{
    save: boolean
    test: boolean
    clear: LlmProvider | null
  }>({ save: false, test: false, clear: null })

  // SSR/hydration: useLocalAiKeys returns the empty default on first render
  // and hydrates after mount. Track the mounted flag so we don't flash the
  // wrong banner before localStorage is read.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const isProd =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_VERCEL_ENV === "production"

  const openEditor = (p: LlmProvider) => {
    setEditing(p)
    setDraft("")
  }
  const cancelEditor = () => {
    setEditing(null)
    setDraft("")
  }

  const handleSave = () => {
    if (!editing) return
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error("Paste a key first")
      return
    }
    setBusy((b) => ({ ...b, save: true }))
    try {
      setKey(editing, trimmed)
      toast.success(`${PROVIDER_LABEL[editing]} key saved on this device`)
      cancelEditor()
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`)
    } finally {
      setBusy((b) => ({ ...b, save: false }))
    }
  }

  const handleTest = async () => {
    if (!editing) return
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error("Paste a key first")
      return
    }
    setBusy((b) => ({ ...b, test: true }))
    try {
      const result = await testKey({ provider: editing, key: trimmed })
      if (result.ok) {
        toast.success(`${PROVIDER_LABEL[editing]} key works`)
      } else {
        toast.error(`Test failed: ${result.error}`)
      }
    } catch (e) {
      toast.error(`Test errored: ${(e as Error).message}`)
    } finally {
      setBusy((b) => ({ ...b, test: false }))
    }
  }

  const handleClear = (p: LlmProvider) => {
    if (!confirm(`Remove your ${PROVIDER_LABEL[p]} key from this device?`))
      return
    setBusy((b) => ({ ...b, clear: p }))
    try {
      const newActive = clearKey(p)
      toast.success(`${PROVIDER_LABEL[p]} key removed`)
      if (newActive !== keys.active) {
        toast.info(`Active model switched to ${PROVIDER_LABEL[newActive]}`)
      }
    } finally {
      setBusy((b) => ({ ...b, clear: null }))
    }
  }

  const handleSwap = (p: LlmProvider) => {
    if (keys.active === p) return
    try {
      setActive(p)
      toast.success(`Switched to ${PROVIDER_LABEL[p]}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const activeKeyMissing =
    (keys.active === "gemini" && !keys.gemini) ||
    (keys.active === "minimax" && !keys.minimax)

  return (
    <div className="rounded-xl border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" />
            <div className="text-base font-semibold">AI Provider Keys</div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring your own Gemini or MiniMax key. Production runs on your
            keys only — preview and local fall back to env vars when set.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300/60 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
        <div>
          Stored only on this device (browser localStorage). Keys are sent
          per-request to reach the model and are never written to our
          database. Clear your browser data to wipe them.
        </div>
      </div>

      {mounted && isProd && activeKeyMissing ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            Production needs your own {PROVIDER_LABEL[keys.active]} key.
            Add one below or your next AI message will fail.
          </div>
        </div>
      ) : null}

      <Separator className="my-4" />

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Active model
        </Label>
        <div className="mt-2 inline-flex rounded-md border p-1">
          {(["gemini", "minimax"] as LlmProvider[]).map((p) => {
            const isActive = keys.active === p
            const hasKey =
              p === "gemini" ? Boolean(keys.gemini) : Boolean(keys.minimax)
            return (
              <Button
                key={p}
                size="sm"
                variant={isActive ? "default" : "ghost"}
                disabled={!hasKey && !isActive}
                onClick={() => handleSwap(p)}
                title={!hasKey && !isActive ? "Add a key first" : undefined}
              >
                {PROVIDER_LABEL[p]}
              </Button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Switching takes effect on your next message.
        </p>
      </div>

      <Separator className="my-4" />

      <div className="space-y-4">
        {(["gemini", "minimax"] as LlmProvider[]).map((p) => {
          const apiKey = p === "gemini" ? keys.gemini : keys.minimax
          const updatedAt =
            p === "gemini" ? keys.geminiUpdatedAt : keys.minimaxUpdatedAt
          const hasKey = Boolean(apiKey)
          const isEditing = editing === p
          const isClearing = busy.clear === p
          return (
            <div key={p} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{PROVIDER_LABEL[p]}</div>
                    {hasKey ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircleIcon className="size-3" /> Saved
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not set</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hasKey ? (
                      <>
                        <span className="font-mono">{maskKey(apiKey)}</span>{" "}
                        · updated {timeAgo(updatedAt)}
                      </>
                    ) : (
                      <>
                        {PROVIDER_HELP[p].hint}{" "}
                        <a
                          href={PROVIDER_HELP[p].url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          Get a key
                        </a>
                        .
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {hasKey ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditor(p)}
                      >
                        Replace
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleClear(p)}
                        disabled={isClearing}
                      >
                        <TrashIcon className="size-4" />
                        {isClearing ? "Removing…" : "Remove"}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => openEditor(p)}>
                      <PlusIcon className="size-4" /> Add key
                    </Button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4 space-y-2">
                  <Label htmlFor={`key-${p}`} className="text-xs">
                    Paste your {PROVIDER_LABEL[p]} key
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${p}`}
                      type="password"
                      autoComplete="off"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        p === "gemini" ? "AIza…" : "sk-… or eyJ…"
                      }
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={handleTest}
                      disabled={busy.test || !draft.trim()}
                    >
                      {busy.test ? "Testing…" : "Test"}
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={busy.save || !draft.trim()}
                    >
                      {busy.save ? "Saving…" : "Save"}
                    </Button>
                    <Button variant="ghost" onClick={cancelEditor}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
