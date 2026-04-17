"use client"

// Throwaway page for manually validating the Spotify integration end-to-end.
// Delete once the picker UI is in place.

import { useState } from "react"
import { Authenticated, Unauthenticated, useAction } from "convex/react"
import { SignInButton } from "@clerk/nextjs"
import { api } from "@/convex/_generated/api"

type SpotifyKind = "track" | "album" | "artist" | "show"
const ALL_KINDS: SpotifyKind[] = ["track", "album", "artist", "show"]

type Result = {
  source: "spotify"
  kind: SpotifyKind
  id: string
  uri: string
  title: string
  subtitle?: string
  imageUrl?: string
}

function Tester() {
  const search = useAction(api.spotify.searchSpotify)
  const [query, setQuery] = useState("radiohead")
  const [kinds, setKinds] = useState<SpotifyKind[]>([...ALL_KINDS])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])

  const toggle = (k: SpotifyKind) => {
    setKinds((cur) =>
      cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k],
    )
  }

  const onRun = async () => {
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const out = (await search({ query, kinds, limit: 5 })) as Result[]
      setResults(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Spotify search tester</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search query"
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <button
          onClick={onRun}
          disabled={loading || !query.trim()}
          style={{ padding: "8px 16px" }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 14 }}>
        {ALL_KINDS.map((k) => (
          <label key={k} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={kinds.includes(k)}
              onChange={() => toggle(k)}
            />
            {k}
          </label>
        ))}
      </div>

      {error && (
        <pre
          style={{
            background: "#fee",
            color: "#900",
            padding: 12,
            borderRadius: 4,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </pre>
      )}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {results.map((r) => (
          <li
            key={`${r.kind}:${r.id}`}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              border: "1px solid #eee",
              padding: 8,
              borderRadius: 4,
            }}
          >
            {r.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.imageUrl}
                alt=""
                width={56}
                height={56}
                style={{ objectFit: "cover", borderRadius: 4 }}
              />
            ) : (
              <div style={{ width: 56, height: 56, background: "#eee", borderRadius: 4 }} />
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {r.kind}
                {r.subtitle ? ` — ${r.subtitle}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SpotifyTestPage() {
  return (
    <>
      <Authenticated>
        <Tester />
      </Authenticated>
      <Unauthenticated>
        <div style={{ padding: 24, fontFamily: "system-ui" }}>
          <p>Sign in to test Spotify search.</p>
          <SignInButton />
        </div>
      </Unauthenticated>
    </>
  )
}
