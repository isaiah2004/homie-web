"use client"

// Thin wrapper around Spotify's public embed iframe. Plays 30s preview for
// non-Premium users and the full track for Premium users, all without the
// Web Playback SDK's licensing + auth requirements. Loaded lazily so a feed
// of 50 tracks doesn't open 50 iframes on first paint.

export function SpotifyEmbed({
  spotifyTrackId,
  compact = false,
}: {
  spotifyTrackId: string
  compact?: boolean
}) {
  return (
    <iframe
      title="Spotify player"
      src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator`}
      width="100%"
      height={compact ? 80 : 152}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      className="rounded-xl border-0"
    />
  )
}
