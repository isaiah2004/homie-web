// Pure age-band helpers. No Convex ctx — these run server-side from gate
// code and from unit tests.
//
// Custom rules (Homie-specific, not industry-standard):
//   - Under 12 is its own bucket; 12+ is the "12_plus" bucket.
//   - 12+ users may chat with peers within ±3 years without approval.
//   - Anything that crosses the under-12 line OR exceeds the ±3 band needs
//     parent approval (recorded in `crossBandRequests`).
//   - Group chats with > 4 years between oldest and youngest must contain a
//     parent member.
//   - Bimodal age distributions (e.g. 4×15 + 4×11) auto-flag for review.

export type AgeBand = "under_12" | "12_plus";

// Computes age in completed years from a "YYYY-MM-DD" DOB and a millisecond
// reference time. Returns NaN if `dob` isn't parseable so callers can decide
// whether to treat it as "unconstrained" (skip rule) or to throw.
export function computeAge(dob: string, nowMs: number): number {
  if (!dob || typeof dob !== "string") return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return NaN;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!yyyy || !mm || !dd) return NaN;
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - yyyy;
  const monthDiff = now.getUTCMonth() + 1 - mm;
  const dayDiff = now.getUTCDate() - dd;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

export function ageBandOf(age: number): AgeBand {
  return age < 12 ? "under_12" : "12_plus";
}

// True iff two users may chat without parent approval.
//
//   - Both under 12 -> allowed (peer-only band).
//   - Both 12+ and within ±3 years -> allowed.
//   - Anything else (including any under-12 ↔ 12+ crossing) -> needs approval.
//
// NaN ages (missing DOB) collapse to "unconstrained" — the gate falls through
// to existing friendship / blocklist checks instead of failing loudly. Adult
// accounts that never set DOB stay usable.
export function withinAllowedBand(ageA: number, ageB: number): boolean {
  if (Number.isNaN(ageA) || Number.isNaN(ageB)) return true;
  const aBand = ageBandOf(ageA);
  const bBand = ageBandOf(ageB);
  if (aBand !== bBand) return false;
  if (aBand === "under_12") return true;
  return Math.abs(ageA - ageB) <= 3;
}

// Largest gap between adjacent sorted ages — drives the "GC must contain a
// parent if span > 4yr" rule. Empty / single-element arrays return 0.
export function maxGapYears(ages: number[]): number {
  const filtered = ages.filter((a) => !Number.isNaN(a)).slice().sort((x, y) => x - y);
  if (filtered.length < 2) return 0;
  let max = 0;
  for (let i = 1; i < filtered.length; i++) {
    const gap = filtered[i] - filtered[i - 1];
    if (gap > max) max = gap;
  }
  return max;
}

// Heuristic flag for "unnatural" age distributions in a group chat.
//
// Returns true iff the sorted ages can be partitioned into 2+ contiguous
// clusters where:
//   - each cluster has at least 3 members,
//   - each cluster spans <= 1 year internally,
//   - the gap to the next cluster is >= 3 years.
//
// Catches the user's example (4×15 + 4×11) without flagging healthy spreads
// like [11, 12, 13, 14, 15]. Heuristic — moderators are notified, no action
// is auto-taken; the GC continues to function.
export function isBimodalAgeDistribution(ages: number[]): boolean {
  const sorted = ages.filter((a) => !Number.isNaN(a)).slice().sort((x, y) => x - y);
  if (sorted.length < 6) return false;
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i];
    if (a - current[current.length - 1] >= 3) {
      clusters.push(current);
      current = [a];
    } else {
      current.push(a);
    }
  }
  clusters.push(current);
  if (clusters.length < 2) return false;
  for (const c of clusters) {
    if (c.length < 3) return false;
    if (c[c.length - 1] - c[0] > 1) return false;
  }
  return true;
}
