import { v } from "convex/values"
import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import {
  getCallerUserId,
  requireCommunityRole,
} from "./_lib/authz"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCallerId(
  ctx: QueryCtx | MutationCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId })
  return await getCallerUserId(ctx, { email: identity.email })
}

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers"> | null> {
  return await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_user", (q) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .unique()
}

async function requireMember(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers">> {
  const m = await getMembership(ctx, communityId, userId)
  if (!m) throw new Error("Not a community member")
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Create a poll. Moderator+. Options must be 2-8 non-empty strings;
// `closesAt` (optional) is a future timestamp after which votes are
// rejected. Polls don't auto-close on the backend — the check happens
// at vote time.
export const createPoll = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    question: v.string(),
    options: v.array(v.string()),
    closesAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(
      ctx,
      callerId,
      args.communityId,
      "moderator",
    )

    const question = args.question.trim()
    if (question.length < 2) throw new Error("Question is too short")

    const cleanedOptions = args.options
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
    if (cleanedOptions.length < 2) {
      throw new Error("At least 2 options are required")
    }
    if (cleanedOptions.length > 8) {
      throw new Error("At most 8 options are allowed")
    }

    if (
      args.closesAt !== undefined &&
      (!Number.isFinite(args.closesAt) || args.closesAt < Date.now())
    ) {
      throw new Error("closesAt must be a future timestamp")
    }

    const now = Date.now()
    return await ctx.db.insert("communityPolls", {
      communityId: args.communityId,
      authorId: callerId,
      question,
      options: cleanedOptions,
      closesAt: args.closesAt,
      createdAt: now,
    })
  },
})

// Edit a poll. Author OR community admin. The caller may pass
//   - just `question` (text-only edit; votes are preserved).
//   - `options` (any rename/reorder/add/remove); in that case every
//     existing vote row is deleted because vote indices no longer map to
//     meaningful choices. The UI asks for confirmation before sending an
//     options-changing payload.
//   - `closesAt` (explicit null clears the deadline; undefined = no
//     change; a number sets a new deadline).
export const updatePoll = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    pollId: v.id("communityPolls"),
    question: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    closesAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const poll = await ctx.db.get(args.pollId)
    if (!poll) throw new Error("Poll not found")

    if (poll.authorId !== callerId) {
      await requireCommunityRole(
        ctx,
        callerId,
        poll.communityId,
        "admin",
      )
    }

    const patch: {
      question?: string
      options?: string[]
      closesAt?: number | undefined
      editedAt: number
    } = { editedAt: Date.now() }

    if (args.question !== undefined) {
      const question = args.question.trim()
      if (question.length < 2) throw new Error("Question is too short")
      patch.question = question
    }

    // Determine if the options list is actually changing. If the caller
    // passes `options` but the array happens to be identical, we don't
    // wipe votes. Callers who want to edit only the question must omit
    // `options` entirely.
    let optionsChanged = false
    if (args.options !== undefined) {
      const cleaned = args.options
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
      if (cleaned.length < 2) {
        throw new Error("At least 2 options are required")
      }
      if (cleaned.length > 8) {
        throw new Error("At most 8 options are allowed")
      }
      const same =
        cleaned.length === poll.options.length &&
        cleaned.every((o, i) => o === poll.options[i])
      if (!same) {
        optionsChanged = true
        patch.options = cleaned
      }
    }

    if (args.closesAt !== undefined) {
      if (args.closesAt === null) {
        patch.closesAt = undefined
      } else {
        if (!Number.isFinite(args.closesAt) || args.closesAt < Date.now()) {
          throw new Error("closesAt must be a future timestamp")
        }
        patch.closesAt = args.closesAt
      }
    }

    await ctx.db.patch(args.pollId, patch)

    // Wipe votes when the option list changes — the stored indices no
    // longer map to the new labels and keeping them would be misleading.
    // We process in batches of 200 to stay within transaction limits; a
    // community poll is unlikely to exceed that, but guarding here keeps
    // the mutation safe for a hot poll with thousands of votes.
    if (optionsChanged) {
      while (true) {
        const batch = await ctx.db
          .query("communityPollVotes")
          .withIndex("by_poll", (q) => q.eq("pollId", args.pollId))
          .take(200)
        if (batch.length === 0) break
        for (const row of batch) {
          await ctx.db.delete(row._id)
        }
        if (batch.length < 200) break
      }
    }
  },
})

// Delete a poll. Author OR community admin. Also wipes every vote row
// referencing it so we don't leave orphan rows behind.
export const deletePoll = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    pollId: v.id("communityPolls"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const poll = await ctx.db.get(args.pollId)
    if (!poll) throw new Error("Poll not found")
    if (poll.authorId !== callerId) {
      await requireCommunityRole(
        ctx,
        callerId,
        poll.communityId,
        "admin",
      )
    }

    while (true) {
      const batch = await ctx.db
        .query("communityPollVotes")
        .withIndex("by_poll", (q) => q.eq("pollId", args.pollId))
        .take(200)
      if (batch.length === 0) break
      for (const row of batch) {
        await ctx.db.delete(row._id)
      }
      if (batch.length < 200) break
    }
    await ctx.db.delete(args.pollId)
  },
})

// Cast or change a vote. Member-only. Deduped by the
// `by_poll_and_user` index — a second call replaces the previous vote
// rather than adding a new row, so vote counts always equal the number
// of distinct voters.
export const vote = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    pollId: v.id("communityPolls"),
    optionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const poll = await ctx.db.get(args.pollId)
    if (!poll) throw new Error("Poll not found")
    await requireMember(ctx, poll.communityId, callerId)

    if (poll.closesAt !== undefined && Date.now() > poll.closesAt) {
      throw new Error("Poll is closed")
    }
    if (
      !Number.isInteger(args.optionIndex) ||
      args.optionIndex < 0 ||
      args.optionIndex >= poll.options.length
    ) {
      throw new Error("Invalid option")
    }

    const now = Date.now()
    const existing = await ctx.db
      .query("communityPollVotes")
      .withIndex("by_poll_and_user", (q) =>
        q.eq("pollId", args.pollId).eq("userId", callerId),
      )
      .unique()
    if (existing) {
      if (existing.optionIndex === args.optionIndex) return
      await ctx.db.patch(existing._id, {
        optionIndex: args.optionIndex,
        votedAt: now,
      })
      return
    }
    await ctx.db.insert("communityPollVotes", {
      pollId: args.pollId,
      userId: callerId,
      optionIndex: args.optionIndex,
      votedAt: now,
    })
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Poll results + the caller's current vote. Member-only.
export const getResults = query({
  args: {
    devUserId: v.optional(v.id("users")),
    pollId: v.id("communityPolls"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const poll = await ctx.db.get(args.pollId)
    if (!poll) return null
    await requireMember(ctx, poll.communityId, callerId)

    const votes = await ctx.db
      .query("communityPollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", args.pollId))
      .collect()

    const counts = new Array<number>(poll.options.length).fill(0)
    let myVote: number | null = null
    for (const v of votes) {
      if (v.optionIndex >= 0 && v.optionIndex < counts.length) {
        counts[v.optionIndex]++
      }
      if (v.userId === callerId) myVote = v.optionIndex
    }
    return {
      poll,
      counts,
      totalVotes: votes.length,
      myVote,
    }
  },
})

// List polls for a community, newest first. Member-only.
export const listPolls = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireMember(ctx, args.communityId, callerId)

    const rows = await ctx.db
      .query("communityPolls")
      .withIndex("by_community_and_created", (q) =>
        q.eq("communityId", args.communityId),
      )
      .order("desc")
      .take(50)

    const enriched = await Promise.all(
      rows.map(async (p) => {
        const author = await ctx.db.get(p.authorId)
        const votes = await ctx.db
          .query("communityPollVotes")
          .withIndex("by_poll", (q) => q.eq("pollId", p._id))
          .collect()
        const counts = new Array<number>(p.options.length).fill(0)
        let myVote: number | null = null
        for (const v of votes) {
          if (v.optionIndex >= 0 && v.optionIndex < counts.length) {
            counts[v.optionIndex]++
          }
          if (v.userId === callerId) myVote = v.optionIndex
        }
        return {
          poll: p,
          counts,
          totalVotes: votes.length,
          myVote,
          author: author
            ? { _id: author._id, name: author.name, username: author.username }
            : null,
        }
      }),
    )
    return enriched
  },
})
