import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

// Scheduled jobs root. Convex auto-loads this file — any new crons go here.
//
// Note: we use `crons.cron` with a raw cron spec rather than `crons.weekly`
// per the internal Convex guidelines (see `convex/_generated/ai/guidelines.md`),
// which instruct that only `crons.interval` / `crons.cron` should be used.
// Cron spec below is "15 0 * * 1" (Monday 00:15 UTC).

const crons = cronJobs()

crons.cron(
  "rotate free-tier community ads",
  "15 0 * * 1",
  internal.communityAds.rotateFreeTierPlacements,
  {},
)

// Spotify real-time "now playing" sweep. Polls only connections whose
// `watchUntil > now`, which clients refresh whenever a viewer opens a
// friend's profile — idle users aren't polled at all.
crons.interval(
  "spotify now-playing sweep",
  { seconds: 30 },
  internal.spotifySync.sweepNowPlaying,
  {},
)

// Spotify scheduled sync. Runs recent on every connection (Spotify only
// keeps the last 50 plays so we must not miss a window); refreshes liked
// every 6h and top every 24h based on `lastXSyncAt` staleness.
crons.interval(
  "spotify scheduled sync",
  { minutes: 15 },
  internal.spotifySync.sweepScheduled,
  {},
)

export default crons
