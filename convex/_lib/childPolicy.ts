import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeAge, ageBandOf, type AgeBand } from "./ageBand";
import type { ParentRole } from "./familyAuthz";

// Single source of truth for child-account policy. Every gate (DM, GC add,
// friend accept, community join, voice handshake) calls `getChildPolicy`
// for each user involved and applies the returned flags. Adding a new
// control = one flag in `childSettings.flags` + one default below + one
// consumer in the gate.

export type ChildPolicy = {
  childUserId: Id<"users">;
  ageBand: AgeBand;
  childAge: number;
  timezone: string | undefined;
  flags: ResolvedFlags;
  nightLockWindow: { start: string; end: string };
  blockedUserIds: Set<string>;
  blockedCommunityIds: Set<string>;
  parents: Array<{ userId: Id<"users">; role: ParentRole }>;
};

// All flags resolved to non-optional booleans (defaults applied).
type ResolvedFlags = {
  friendApprovalRequired: boolean;
  communityApprovalRequired: boolean;
  blockNonFriendDms: boolean;
  discoverabilityRestricted: boolean;
  contentFilterPg13: boolean;
  voiceChatAllowed: boolean;
  agentDisabled: boolean;
  agentRestricted: boolean;
  nightLockEnabled: boolean;
  parentSeesFriends: boolean;
  parentSeesDmPartners: boolean;
  parentSeesCommunities: boolean;
  parentSeesActivity: boolean;
  parentSeesProfile: boolean;
  calendarVisibleToParents: boolean;
  unlinkAt18: boolean;
  accountLocked: boolean;
};

// Age-band defaults. Stricter defaults for under-12; relaxed for 12+ teens.
// Tweaking a default ripples to every child without that flag explicitly set.
const DEFAULT_FLAGS: Record<AgeBand, ResolvedFlags> = {
  under_12: {
    friendApprovalRequired: true,
    communityApprovalRequired: true,
    blockNonFriendDms: true,
    discoverabilityRestricted: true,
    contentFilterPg13: true,
    voiceChatAllowed: false,
    agentDisabled: false,
    agentRestricted: true,
    nightLockEnabled: false,
    parentSeesFriends: true,
    parentSeesDmPartners: true,
    parentSeesCommunities: true,
    parentSeesActivity: true,
    parentSeesProfile: true,
    calendarVisibleToParents: true,
    unlinkAt18: true,
    accountLocked: false,
  },
  "12_plus": {
    friendApprovalRequired: true,
    communityApprovalRequired: false,
    blockNonFriendDms: true,
    discoverabilityRestricted: true,
    contentFilterPg13: true,
    voiceChatAllowed: true,
    agentDisabled: false,
    agentRestricted: false,
    nightLockEnabled: false,
    parentSeesFriends: true,
    parentSeesDmPartners: true,
    parentSeesCommunities: true,
    parentSeesActivity: true,
    parentSeesProfile: false,
    calendarVisibleToParents: true,
    unlinkAt18: true,
    accountLocked: false,
  },
};

// Applies stored optional flags on top of age-band defaults.
function resolveFlags(
  band: AgeBand,
  stored: Doc<"childSettings">["flags"],
): ResolvedFlags {
  const defaults = DEFAULT_FLAGS[band];
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof ResolvedFlags)[]) {
    const v = stored[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

// Returns the resolved policy for `userId`, or `null` if the user is not a
// child (so every gate can `if (!policy) fallthrough`).
export async function getChildPolicy(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  nowMs: number = Date.now(),
): Promise<ChildPolicy | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  if (!user.isChild) return null;
  const settings = await ctx.db
    .query("childSettings")
    .withIndex("by_child", (q) => q.eq("childUserId", userId))
    .unique();
  if (!settings) return null;
  const childAge = computeAge(user.dob ?? "", nowMs);
  // Trust the cached ageBand on settings unless it's flagrantly wrong.
  const computedBand = Number.isNaN(childAge) ? settings.ageBand : ageBandOf(childAge);
  const band: AgeBand = computedBand;
  const flags = resolveFlags(band, settings.flags);
  const nightLockWindow = settings.nightLockWindow ?? { start: "22:00", end: "06:00" };
  const blockedUserIds = new Set<string>(
    (settings.blockedUserIds ?? []).map((id) => id as unknown as string),
  );
  const blockedCommunityIds = new Set<string>(
    (settings.blockedCommunityIds ?? []).map((id) => id as unknown as string),
  );
  const links = await ctx.db
    .query("familyLinks")
    .withIndex("by_child_and_status", (q) =>
      q.eq("childUserId", userId).eq("status", "active"),
    )
    .collect();
  const parents = links.map((l) => ({ userId: l.parentUserId, role: l.parentRole }));
  return {
    childUserId: userId,
    ageBand: band,
    childAge,
    timezone: settings.childTimezone,
    flags,
    nightLockWindow,
    blockedUserIds,
    blockedCommunityIds,
    parents,
  };
}

// Cheap fast-path used by gates that only need to know "is this even a
// child?" before doing expensive work.
export async function isChild(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return Boolean(user?.isChild);
}

// Returns the current "HH:MM" wall-clock time in `tz` for `nowMs`. If `tz`
// is missing or invalid, falls back to UTC. Used by the night-lock gate.
export function localHhmm(nowMs: number, tz: string | undefined): string {
  try {
    const d = new Date(nowMs);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz || "UTC",
    });
    return fmt.format(d);
  } catch {
    const d = new Date(nowMs);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
}

// True iff `hhmm` falls inside the [start, end) window. Handles wrap-around
// (e.g. 22:00–06:00 spans midnight).
export function isInWindow(
  hhmm: string,
  start: string,
  end: string,
): boolean {
  const cur = parseHhmm(hhmm);
  const s = parseHhmm(start);
  const e = parseHhmm(end);
  if (Number.isNaN(cur) || Number.isNaN(s) || Number.isNaN(e)) return false;
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;
  // wrap-around: e.g. 22:00–06:00
  return cur >= s || cur < e;
}

function parseHhmm(s: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Convenience predicate used by the DM gate.
export function isInNightLock(
  policy: ChildPolicy,
  nowMs: number = Date.now(),
): boolean {
  if (!policy.flags.nightLockEnabled) return false;
  const hhmm = localHhmm(nowMs, policy.timezone);
  return isInWindow(hhmm, policy.nightLockWindow.start, policy.nightLockWindow.end);
}
