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

// Canonical day bucket for ad metrics: `YYYY-MM-DD` in UTC. Used as the
// `dateBucket` key for `adMetrics`; a single index lookup resolves
// "today's counts for this ad" in O(1).
export function todayUtcBucket(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

// Same bucket format but for an arbitrary epoch-ms value. Used when
// back-filling / generating the continuous x-axis for analytics charts.
export function utcBucketFromMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

// Returns the UTC day-buckets for the last `n` days, oldest → newest.
// Used by analytics queries to pad missing metric rows with zeros so
// charts render a continuous x-axis regardless of sparse data.
export function lastNDaysBuckets(n: number): string[] {
  const out: string[] = []
  const today = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(today.getUTCDate() - i)
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    )
  }
  return out
}
