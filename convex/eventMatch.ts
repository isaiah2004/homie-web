"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { SearchHit } from "./embeddings";

const REROLL_CAP = 3;
const MATCH_LIMIT = 10;

type ScoredCandidate = {
  userId: Id<"users">;
  score: number;
  reasons: string[];
};

// Sub-score weights — see plan.
const W_VECTOR = 0.4;
const W_MEDIA = 0.25;
const W_INTERESTS = 0.2;
const W_MUTUALS = 0.15;

type MediaItem = {
  title: string;
  externalSource?: string;
  externalId?: string;
};

function mediaOverlapCount(askerMedia: MediaItem[], candidateMedia: MediaItem[]): number {
  if (askerMedia.length === 0 || candidateMedia.length === 0) return 0;
  type Key =
    | { kind: "ext"; source: string; id: string }
    | { kind: "title"; value: string };
  const askerKeys: Key[] = askerMedia.map((m) =>
    m.externalSource && m.externalId
      ? { kind: "ext", source: m.externalSource, id: m.externalId }
      : { kind: "title", value: m.title.trim().toLowerCase() },
  );
  let count = 0;
  for (const m of candidateMedia) {
    const matched = askerKeys.some((k) =>
      k.kind === "ext"
        ? m.externalSource === k.source && m.externalId === k.id
        : m.title.trim().toLowerCase() === k.value,
    );
    if (matched) count++;
  }
  return count;
}

function buildQueryString(user: Doc<"users">): string {
  const parts: string[] = [];
  for (const i of user.interests ?? []) parts.push(i.value);
  for (const i of user.eventInterests ?? []) parts.push(i.value);
  for (const m of user.media ?? []) parts.push(m.title);
  return parts.join(", ").slice(0, 1000);
}

function caseFoldedSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean));
}

async function computeMatches(
  ctx: ActionCtx,
  args: { eventId: Id<"events">; viewerId: Id<"users">; excludeIds: Set<string> },
): Promise<ScoredCandidate[]> {
  // Membership pool.
  const memberIds: Id<"users">[] = await ctx.runQuery(
    internal.eventRooms.internalListMemberIds,
    { eventId: args.eventId },
  );
  const acceptedFriends: Id<"users">[] = await ctx.runQuery(
    internal.eventRooms.internalGetAcceptedFriendIds,
    { userId: args.viewerId },
  );
  const friendSet = new Set(acceptedFriends.map((id) => id as string));
  const candidatePool = memberIds.filter(
    (id) =>
      id !== args.viewerId &&
      !friendSet.has(id as string) &&
      !args.excludeIds.has(id as string),
  );
  if (candidatePool.length === 0) return [];

  const viewer: Doc<"users"> | null = await ctx.runQuery(
    internal.eventRooms.internalGetUser,
    { userId: args.viewerId },
  );
  if (!viewer) return [];

  // Pre-fetch candidate user docs (one round-trip per candidate; pool is
  // bounded by lobby size). The plan flags this as the smaller of the two
  // costs (vs Qdrant) so we accept it.
  const candidateDocs = await Promise.all(
    candidatePool.map(
      (id): Promise<Doc<"users"> | null> =>
        ctx.runQuery(internal.eventRooms.internalGetUser, { userId: id }),
    ),
  );

  // ── Sub-score 1: vector similarity ──────────────────────────────────────
  // Batch one Qdrant call per entityType, widening the ownerIds filter to
  // the entire pool. Group hits by ownerId in JS afterwards.
  const allowedVisibilityByOwner = candidatePool.map((id) => ({
    ownerId: id,
    allowed: ["close", "friends", "mutual"] as Array<
      "close" | "friends" | "mutual" | "none"
    >,
  }));
  const queryString = buildQueryString(viewer);
  const entityTypes: Array<"interest" | "media"> = ["interest", "media"];
  const vectorScoreByOwner = new Map<string, number>();
  if (queryString.trim().length > 0) {
    for (const entityType of entityTypes) {
      const hits: SearchHit[] = await ctx.runAction(
        internal.embeddings.searchProfileItems,
        {
          entityType,
          query: queryString,
          ownerIds: candidatePool,
          allowedVisibilityByOwner,
          limit: candidatePool.length * 2,
        },
      );
      for (const hit of hits) {
        const key = hit.ownerId as string;
        const prev = vectorScoreByOwner.get(key) ?? 0;
        if (hit.score > prev) vectorScoreByOwner.set(key, hit.score);
      }
    }
  }

  // ── Sub-score 4 (mutuals) ───────────────────────────────────────────────
  const mutualsByOwner = new Map<string, number>();
  for (const cand of candidatePool) {
    const m: number = await ctx.runQuery(
      internal.eventRooms.internalCountMutuals,
      { userAId: args.viewerId, userBId: cand },
    );
    mutualsByOwner.set(cand as string, m);
  }

  // Build viewer's eventInterests set once.
  const viewerEventInterests = caseFoldedSet(
    (viewer.eventInterests ?? []).map((e) => e.value),
  );
  const viewerMedia: MediaItem[] = (viewer.media ?? []).map((m) => ({
    title: m.title,
    externalSource: m.externalSource,
    externalId: m.externalId,
  }));

  const scored: ScoredCandidate[] = [];
  for (const cand of candidateDocs) {
    if (!cand) continue;
    const candKey = cand._id as string;

    const candMedia: MediaItem[] = (cand.media ?? []).map((m) => ({
      title: m.title,
      externalSource: m.externalSource,
      externalId: m.externalId,
    }));
    const mediaCount = mediaOverlapCount(viewerMedia, candMedia);

    const candEventInterests = caseFoldedSet(
      (cand.eventInterests ?? []).map((e) => e.value),
    );
    let interestOverlap = 0;
    const sharedInterestNames: string[] = [];
    for (const ei of candEventInterests) {
      if (viewerEventInterests.has(ei)) {
        interestOverlap++;
        sharedInterestNames.push(ei);
      }
    }

    const mutualCount = mutualsByOwner.get(candKey) ?? 0;
    const vectorScore = vectorScoreByOwner.get(candKey) ?? 0;

    // Normalize each component to [0,1] before weighting.
    const normVector = Math.min(1, Math.max(0, vectorScore));
    const normMedia = Math.min(1, mediaCount / 5);
    const normInterests = Math.min(1, interestOverlap / 3);
    const normMutuals = Math.min(1, mutualCount / 5);

    const total =
      normVector * W_VECTOR +
      normMedia * W_MEDIA +
      normInterests * W_INTERESTS +
      normMutuals * W_MUTUALS;

    // Build top-3 reasons by ranking sub-scores.
    const reasonChips: Array<{ score: number; text: string }> = [];
    if (mutualCount > 0) {
      reasonChips.push({
        score: normMutuals,
        text: `${mutualCount} mutual friend${mutualCount === 1 ? "" : "s"}`,
      });
    }
    if (mediaCount > 0) {
      // Find the first overlapping title for a friendly chip.
      const sharedTitle = candMedia.find((m) =>
        viewerMedia.some(
          (vm) =>
            (vm.externalSource &&
              vm.externalId &&
              vm.externalSource === m.externalSource &&
              vm.externalId === m.externalId) ||
            vm.title.trim().toLowerCase() === m.title.trim().toLowerCase(),
        ),
      );
      reasonChips.push({
        score: normMedia,
        text: sharedTitle
          ? `Both like ${sharedTitle.title}`
          : `${mediaCount} shared media`,
      });
    }
    if (interestOverlap > 0) {
      const first = sharedInterestNames[0];
      reasonChips.push({
        score: normInterests,
        text: first
          ? `Shares "${first}" interest`
          : `${interestOverlap} shared interests`,
      });
    }
    if (normVector > 0.3) {
      reasonChips.push({
        score: normVector,
        text: "Similar vibes",
      });
    }
    reasonChips.sort((a, b) => b.score - a.score);
    const reasons = reasonChips.slice(0, 3).map((c) => c.text);

    scored.push({ userId: cand._id, score: total, reasons });
  }

  // Sort highest score first. Ties broken deterministically by userId so
  // tests get stable orderings.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.userId as string).localeCompare(b.userId as string);
  });
  return scored.slice(0, MATCH_LIMIT);
}

type MatchStateRow = {
  _id: Id<"eventMatchState">;
  _creationTime: number;
  eventId: Id<"events">;
  viewerId: Id<"users">;
  rerollCount: number;
  shownUserIds: Id<"users">[];
  currentMatches: ScoredCandidate[];
  lastComputedAt: number;
};

export const computeInitialMatches = action({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ rerollsRemaining: number }> => {
    const viewerId: Id<"users"> = await ctx.runQuery(
      internal.eventRooms.internalResolveViewerForAction,
      { devUserId: args.devUserId },
    );
    const isMember: boolean = await ctx.runQuery(
      internal.eventRooms.internalAssertMembership,
      { eventId: args.eventId, userId: viewerId },
    );
    if (!isMember) throw new Error("You are not a member of this lobby");

    // If state already exists, computeInitial is idempotent — return the
    // cached state instead of recomputing.
    const existing: MatchStateRow | null = await ctx.runQuery(
      internal.eventRooms.internalGetMatchState,
      { eventId: args.eventId, viewerId },
    );
    if (existing) {
      return {
        rerollsRemaining: Math.max(0, REROLL_CAP - existing.rerollCount),
      };
    }

    const matches = await computeMatches(ctx, {
      eventId: args.eventId,
      viewerId,
      excludeIds: new Set<string>(),
    });
    const shownUserIds = matches.map((m) => m.userId);
    await ctx.runMutation(internal.eventRooms.internalSetMatchState, {
      eventId: args.eventId,
      viewerId,
      rerollCount: 0,
      shownUserIds,
      currentMatches: matches,
    });
    return { rerollsRemaining: REROLL_CAP };
  },
});

export const rerollMatches = action({
  args: {
    devUserId: v.optional(v.id("users")),
    eventId: v.id("events"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ rerollsRemaining: number }> => {
    const viewerId: Id<"users"> = await ctx.runQuery(
      internal.eventRooms.internalResolveViewerForAction,
      { devUserId: args.devUserId },
    );
    const isMember: boolean = await ctx.runQuery(
      internal.eventRooms.internalAssertMembership,
      { eventId: args.eventId, userId: viewerId },
    );
    if (!isMember) throw new Error("You are not a member of this lobby");

    const existing: MatchStateRow | null = await ctx.runQuery(
      internal.eventRooms.internalGetMatchState,
      { eventId: args.eventId, viewerId },
    );
    if (!existing) {
      throw new Error("Run the initial match before rerolling");
    }
    if (existing.rerollCount >= REROLL_CAP) {
      throw new Error("No rerolls remaining");
    }

    const excludeIds = new Set<string>(
      existing.shownUserIds.map((id) => id as string),
    );
    const matches = await computeMatches(ctx, {
      eventId: args.eventId,
      viewerId,
      excludeIds,
    });
    const shownUserIds: Id<"users">[] = [
      ...existing.shownUserIds,
      ...matches.map((m) => m.userId),
    ];
    await ctx.runMutation(internal.eventRooms.internalSetMatchState, {
      eventId: args.eventId,
      viewerId,
      rerollCount: existing.rerollCount + 1,
      shownUserIds,
      currentMatches: matches,
    });
    return {
      rerollsRemaining: Math.max(0, REROLL_CAP - (existing.rerollCount + 1)),
    };
  },
});
