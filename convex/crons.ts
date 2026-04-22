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

export default crons
