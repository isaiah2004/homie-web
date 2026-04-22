// Returns the epoch-ms for this week's Monday at 00:00 UTC. Used as the
// canonical `weekStart` key for `communityAdPlacements` so a simple index
// lookup resolves "the current week's placement" for a community.
//
// Day-of-week math: `getUTCDay()` returns 0 for Sunday ... 6 for Saturday.
// `(day + 6) % 7` re-bases that to 0 for Monday ... 6 for Sunday so we can
// subtract it from the current date to land exactly on Monday 00:00 UTC.
export function currentMondayUTCms(): number {
  const now = new Date()
  const day = now.getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      0,
      0,
      0,
      0,
    ),
  )
  return monday.getTime()
}
