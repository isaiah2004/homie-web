import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveIdentity } from "./lib/identity";
import { getChildPolicy } from "./_lib/childPolicy";
import {
  computeAge,
  isBimodalAgeDistribution,
  maxGapYears,
} from "./_lib/ageBand";

// ─────────────────────────────────────────────────────────────────────────────
// Constants / helpers
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_MEMBERS = 15;

async function resolveViewerId(
  ctx: QueryCtx,
  args: { devUserId?: Id<"users"> },
): Promise<Id<"users">> {
  const identity = await resolveIdentity(ctx, { devUserId: args.devUserId });
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique();
  if (!user) throw new Error("User not found for identity");
  return user._id;
}

async function isAcceptedFriend(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  friendId: Id<"users">,
): Promise<boolean> {
  if (ownerId === friendId) return false;
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", ownerId).eq("friendId", friendId),
    )
    .unique();
  return edge?.status === "accepted";
}

async function getMembership(
  ctx: QueryCtx,
  groupChatId: Id<"groupChats">,
  userId: Id<"users">,
): Promise<Doc<"groupChatMembers"> | null> {
  return await ctx.db
    .query("groupChatMembers")
    .withIndex("by_group_and_user", (q) =>
      q.eq("groupChatId", groupChatId).eq("userId", userId),
    )
    .unique();
}

async function listMembers(
  ctx: QueryCtx,
  groupChatId: Id<"groupChats">,
): Promise<Doc<"groupChatMembers">[]> {
  return await ctx.db
    .query("groupChatMembers")
    .withIndex("by_group", (q) => q.eq("groupChatId", groupChatId))
    .collect();
}

async function countAdmins(
  ctx: QueryCtx,
  groupChatId: Id<"groupChats">,
): Promise<number> {
  const members = await listMembers(ctx, groupChatId);
  return members.filter((m) => m.role === "admin").length;
}

async function requireAdmin(
  ctx: QueryCtx,
  groupChatId: Id<"groupChats">,
  userId: Id<"users">,
): Promise<Doc<"groupChatMembers">> {
  const me = await getMembership(ctx, groupChatId, userId);
  if (!me) throw new Error("You are not a member of this group");
  if (me.role !== "admin") throw new Error("Only admins can do that");
  return me;
}

// Returns true iff `parentId` has an active familyLinks edge to `childId`.
async function isParentOfChild(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"users">,
  childId: Id<"users">,
): Promise<boolean> {
  const link = await ctx.db
    .query("familyLinks")
    .withIndex("by_pair", (q) =>
      q.eq("parentUserId", parentId).eq("childUserId", childId),
    )
    .unique();
  return Boolean(link && link.status === "active");
}

// Group-chat age-policy enforcement called from createGroupChat and
// addMember. Two rules:
//   1. If max gap > 4 years AND no member is the parent of any other
//      member, reject — large age spreads must include a guardian.
//   2. If the age distribution is bimodal (per `isBimodalAgeDistribution`),
//      let the chat continue but flag every child involved by notifying
//      their guardians and writing an audit row. The flag is informative,
//      not a block.
// Members with unparseable / missing DOB are treated as "no constraint"
// and skipped for age math.
async function enforceGroupAgePolicy(
  ctx: MutationCtx,
  groupId: Id<"groupChats">,
  allMemberUserIds: Id<"users">[],
): Promise<void> {
  const now = Date.now();
  // Dedupe in case the caller passed overlapping ids.
  const uniqueIds = Array.from(new Set(allMemberUserIds));
  const users = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
  const ages: number[] = [];
  for (const u of users) {
    if (!u) continue;
    const age = computeAge(u.dob ?? "", now);
    if (!Number.isNaN(age)) ages.push(age);
  }

  if (ages.length >= 2 && maxGapYears(ages) > 4) {
    // Require at least one parent-of-another-member among the roster.
    let hasParentMember = false;
    outer: for (const a of uniqueIds) {
      for (const b of uniqueIds) {
        if (a === b) continue;
        if (await isParentOfChild(ctx, a, b)) {
          hasParentMember = true;
          break outer;
        }
      }
    }
    if (!hasParentMember) {
      throw new Error(
        "Group chats with more than 4 years between members must include a parent",
      );
    }
  }

  if (isBimodalAgeDistribution(ages)) {
    // Find every child member; fire a notification to their guardians
    // and write an audit row. Failures to enqueue are non-fatal — the
    // GC must continue to function.
    for (const id of uniqueIds) {
      const policy = await getChildPolicy(ctx, id, now);
      if (!policy) continue;
      for (const parent of policy.parents) {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.createNotification,
          {
            userId: parent.userId,
            type: "groupchat_age_distribution_flagged",
            title: "Group chat flagged for unusual age mix",
            body: undefined,
            link: `/dashboard/family/${id}/audit`,
            meta: { groupChatId: groupId, childId: id },
          },
        );
      }
      await ctx.scheduler.runAfter(0, internal.family.internalLogAudit, {
        childUserId: id,
        actorUserId: id,
        action: "groupchat_flagged_distribution",
        meta: { groupChatId: groupId },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Create a new group chat. The caller is auto-added as an admin. Additional
// members must be accepted friends of the caller and the total (caller +
// memberIds) must not exceed MAX_MEMBERS.
export const createGroupChat = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    name: v.string(),
    memberIds: v.array(v.id("users")),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const creatorId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Group name must be at least 2 characters");
    }

    // Dedupe + strip the creator if the caller accidentally included them.
    const uniqueMembers = Array.from(
      new Set(args.memberIds.filter((id) => id !== creatorId)),
    );

    if (uniqueMembers.length < 2) {
      throw new Error("A group needs at least 3 members");
    }
    if (uniqueMembers.length + 1 > MAX_MEMBERS) {
      throw new Error(`Groups can have at most ${MAX_MEMBERS} members`);
    }

    // Validate every invitee is an accepted friend of the creator.
    for (const memberId of uniqueMembers) {
      const target = await ctx.db.get(memberId);
      if (!target) throw new Error("Invited user not found");
      const ok = await isAcceptedFriend(ctx, creatorId, memberId);
      if (!ok) {
        throw new Error(
          `Cannot add ${target.name}: they must be an accepted friend`,
        );
      }
    }

    const now = Date.now();
    const groupChatId = await ctx.db.insert("groupChats", {
      name,
      avatarUrl: args.avatarUrl,
      createdBy: creatorId,
      createdAt: now,
      lastMessageAt: now,
      memberCount: uniqueMembers.length + 1,
    });

    // Seed creator as admin, others as members.
    await ctx.db.insert("groupChatMembers", {
      groupChatId,
      userId: creatorId,
      role: "admin",
      addedAt: now,
      addedBy: creatorId,
    });
    for (const memberId of uniqueMembers) {
      await ctx.db.insert("groupChatMembers", {
        groupChatId,
        userId: memberId,
        role: "member",
        addedAt: now,
        addedBy: creatorId,
      });
    }

    await enforceGroupAgePolicy(ctx, groupChatId, [
      creatorId,
      ...uniqueMembers,
    ]);

    return groupChatId;
  },
});

// List every group the caller is a member of, enriched with unread count.
// Unread = any message in the group whose `readBy` array doesn't contain
// the caller. Bounded at 200 messages per group for the scan (caps unread
// at 200+ for stability — rare in practice for a 15-person group).
export const listGroupChatsForUser = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const myMemberships = await ctx.db
      .query("groupChatMembers")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .collect();

    const rows = await Promise.all(
      myMemberships.map(async (m) => {
        const group = await ctx.db.get(m.groupChatId);
        if (!group) return null;
        const recent = await ctx.db
          .query("groupChatMessages")
          .withIndex("by_group_and_sentAt", (q) =>
            q.eq("groupChatId", group._id),
          )
          .order("desc")
          .take(200);
        let unread = 0;
        for (const msg of recent) {
          const hasReceipt = msg.readBy.some(
            (r) => r.userId === viewerId,
          );
          if (!hasReceipt && msg.from !== viewerId) unread++;
        }
        return {
          group,
          role: m.role,
          unreadCount: unread,
        };
      }),
    );

    const filtered = rows.filter(
      (r): r is { group: Doc<"groupChats">; role: "admin" | "member"; unreadCount: number } =>
        r !== null,
    );
    filtered.sort(
      (a, b) => b.group.lastMessageAt - a.group.lastMessageAt,
    );
    return filtered;
  },
});

// Single-group read: returns the group + members enriched with user docs +
// the caller's role. Membership-gated.
export const getGroupChat = query({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const me = await getMembership(ctx, args.groupChatId, viewerId);
    if (!me) throw new Error("You are not a member of this group");

    const group = await ctx.db.get(args.groupChatId);
    if (!group) throw new Error("Group not found");
    const members = await listMembers(ctx, args.groupChatId);
    const enriched = await Promise.all(
      members.map(async (m) => ({
        membership: m,
        user: await ctx.db.get(m.userId),
      })),
    );

    return {
      group,
      members: enriched,
      myRole: me.role,
      myUserId: viewerId,
    };
  },
});

// Add a new member. Admin-only. Enforces cap, friendship between the
// *caller* and the new member (not transitive), and rejects duplicates.
export const addMember = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    newUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await requireAdmin(ctx, args.groupChatId, viewerId);

    const existing = await getMembership(
      ctx,
      args.groupChatId,
      args.newUserId,
    );
    if (existing) throw new Error("User is already a member");

    const group = await ctx.db.get(args.groupChatId);
    if (!group) throw new Error("Group not found");
    if (group.memberCount >= MAX_MEMBERS) {
      throw new Error(`Groups can have at most ${MAX_MEMBERS} members`);
    }

    const target = await ctx.db.get(args.newUserId);
    if (!target) throw new Error("User not found");
    const ok = await isAcceptedFriend(ctx, viewerId, args.newUserId);
    if (!ok) {
      throw new Error(
        `Cannot add ${target.name}: they must be your accepted friend`,
      );
    }

    const currentMembers = await listMembers(ctx, args.groupChatId);
    const currentMemberIds = currentMembers.map((m) => m.userId);
    await enforceGroupAgePolicy(ctx, args.groupChatId, [
      ...currentMemberIds,
      args.newUserId,
    ]);

    await ctx.db.insert("groupChatMembers", {
      groupChatId: args.groupChatId,
      userId: args.newUserId,
      role: "member",
      addedAt: Date.now(),
      addedBy: viewerId,
    });
    await ctx.db.patch(args.groupChatId, {
      memberCount: group.memberCount + 1,
    });
  },
});

// Remove a member. Admin-only. Prevents removing the last admin — admins
// must either promote someone else first or leave the group via
// `leaveGroupChat` which auto-promotes.
export const removeMember = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await requireAdmin(ctx, args.groupChatId, viewerId);

    const target = await getMembership(
      ctx,
      args.groupChatId,
      args.targetUserId,
    );
    if (!target) throw new Error("User is not a member");

    if (target.role === "admin") {
      const admins = await countAdmins(ctx, args.groupChatId);
      if (admins <= 1) {
        throw new Error(
          "Cannot remove the last admin — promote another member first",
        );
      }
    }

    const group = await ctx.db.get(args.groupChatId);
    if (!group) throw new Error("Group not found");

    await ctx.db.delete(target._id);
    await ctx.db.patch(args.groupChatId, {
      memberCount: Math.max(0, group.memberCount - 1),
    });
  },
});

// Leave a group. If the caller is the sole admin, auto-promote the
// earliest-joined remaining member to admin so the group always has at
// least one admin while it's still populated.
export const leaveGroupChat = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const me = await getMembership(ctx, args.groupChatId, viewerId);
    if (!me) throw new Error("You are not a member of this group");

    const group = await ctx.db.get(args.groupChatId);
    if (!group) throw new Error("Group not found");

    const members = await listMembers(ctx, args.groupChatId);
    const others = members.filter((m) => m.userId !== viewerId);

    // Sole admin case: promote the oldest remaining member to admin first.
    if (me.role === "admin") {
      const otherAdmins = others.filter((m) => m.role === "admin");
      if (otherAdmins.length === 0 && others.length > 0) {
        const next = [...others].sort(
          (a, b) => a.addedAt - b.addedAt,
        )[0];
        await ctx.db.patch(next._id, { role: "admin" });
      }
    }

    await ctx.db.delete(me._id);
    await ctx.db.patch(args.groupChatId, {
      memberCount: Math.max(0, group.memberCount - 1),
    });
  },
});

// Promote a member to admin. Admin-only.
export const promoteToAdmin = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await requireAdmin(ctx, args.groupChatId, viewerId);

    const target = await getMembership(
      ctx,
      args.groupChatId,
      args.targetUserId,
    );
    if (!target) throw new Error("User is not a member");
    if (target.role === "admin") return;
    await ctx.db.patch(target._id, { role: "admin" });
  },
});

// Demote an admin to member. Admin-only. Rejects if demoting would leave
// the group with zero admins.
export const demoteToMember = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    await requireAdmin(ctx, args.groupChatId, viewerId);

    const target = await getMembership(
      ctx,
      args.groupChatId,
      args.targetUserId,
    );
    if (!target) throw new Error("User is not a member");
    if (target.role === "member") return;

    const admins = await countAdmins(ctx, args.groupChatId);
    if (admins <= 1) {
      throw new Error(
        "Cannot demote the last admin — promote another member first",
      );
    }
    await ctx.db.patch(target._id, { role: "member" });
  },
});

// Delete a group. Only callable when caller is the only remaining admin AND
// sole remaining member (memberCount === 1). Cascade deletes all
// groupChatMembers + groupChatMessages + groupChatAgentResponses.
export const deleteGroupChat = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, args) => {
    const viewerId = await resolveViewerId(ctx, {
      devUserId: args.devUserId,
    });
    const me = await requireAdmin(ctx, args.groupChatId, viewerId);

    const group = await ctx.db.get(args.groupChatId);
    if (!group) throw new Error("Group not found");
    if (group.memberCount !== 1) {
      throw new Error(
        "Cannot delete: remove all other members first (group must have just you)",
      );
    }

    // Cascade delete. Keep batches modest to stay within transaction limits.
    // For a solo group the volumes are tiny — everything fits in one batch.
    const members = await listMembers(ctx, args.groupChatId);
    for (const m of members) await ctx.db.delete(m._id);

    const messages = await ctx.db
      .query("groupChatMessages")
      .withIndex("by_group", (q) =>
        q.eq("groupChatId", args.groupChatId),
      )
      .take(500);
    for (const msg of messages) await ctx.db.delete(msg._id);

    const responses = await ctx.db
      .query("groupChatAgentResponses")
      .withIndex("by_group_and_asker", (q) =>
        q.eq("groupChatId", args.groupChatId),
      )
      .take(500);
    for (const r of responses) await ctx.db.delete(r._id);

    await ctx.db.delete(args.groupChatId);
    // Unused variable suppressant — avoid lint complaints about the
    // intentionally-resolved admin membership.
    void me;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal queries
// ─────────────────────────────────────────────────────────────────────────────

// Internal helper used by `convex/groupChatAgent.ts` actions to pull a
// visibility-scoped profile for every member of a group, from the asker's
// perspective. Mirrors the visibility logic in `users.getUserForViewer`
// (inlined here because we need it callable without ctx.auth).
type VisibilityTag = "close" | "friends" | "mutual" | "none";
type Relationship = "self" | "close" | "friend" | "mutual" | "none";

async function viewerRelationship(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  ownerId: Id<"users">,
): Promise<Relationship> {
  if (viewerId === ownerId) return "self";
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", ownerId).eq("friendId", viewerId),
    )
    .unique();
  if (edge?.status === "accepted") {
    return edge.tier === "close" ? "close" : "friend";
  }
  const viewerFriends = new Set(
    (
      await ctx.db
        .query("friends")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", viewerId).eq("status", "accepted"),
        )
        .collect()
    ).map((r) => r.friendId),
  );
  if (viewerFriends.size > 0) {
    const ownerFriends = await ctx.db
      .query("friends")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", ownerId).eq("status", "accepted"),
      )
      .collect();
    for (const row of ownerFriends) {
      if (viewerFriends.has(row.friendId)) return "mutual";
    }
  }
  return "none";
}

function canSee(rel: Relationship, tag: VisibilityTag): boolean {
  if (rel === "self") return true;
  if (tag === "none") return false;
  if (tag === "close") return rel === "close";
  if (tag === "friends") return rel === "close" || rel === "friend";
  if (tag === "mutual") {
    return rel === "close" || rel === "friend" || rel === "mutual";
  }
  return false;
}

// Internal: returns trimmed member profiles the asker is allowed to see.
// Used by the groupChatAgent skills for findHangout / pickMovie prompts.
export const getMemberProfilesInternal = internalQuery({
  args: {
    groupChatId: v.id("groupChats"),
    askerId: v.id("users"),
  },
  handler: async (ctx, { groupChatId, askerId }) => {
    const members = await listMembers(ctx, groupChatId);
    const rows = await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        if (!user) return null;
        const rel = await viewerRelationship(ctx, askerId, user._id);
        const interests = (user.interests ?? [])
          .filter((i) => canSee(rel, i.visibility))
          .map((i) => i.value);
        const places = (user.places ?? [])
          .filter((p) => canSee(rel, p.visibility))
          .map((p) => ({
            name: p.name,
            type: p.type,
            address: p.address ?? null,
            tags: p.tags,
          }));
        const media = (user.media ?? [])
          .filter((m) => canSee(rel, m.visibility))
          .map((m) => ({
            title: m.title,
            type: m.type,
            subtitle: m.subtitle ?? null,
          }));
        return {
          userId: user._id,
          name: user.name,
          location: user.location ?? null,
          interests,
          places,
          media,
          isSelf: user._id === askerId,
        };
      }),
    );
    return rows.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );
  },
});

// Internal: caller-gated membership assertion used by internal actions that
// need to confirm the asker is a member before running an agent skill.
export const assertMembershipInternal = internalQuery({
  args: {
    groupChatId: v.id("groupChats"),
    userId: v.id("users"),
  },
  handler: async (ctx, { groupChatId, userId }) => {
    const m = await getMembership(ctx, groupChatId, userId);
    return m !== null;
  },
});

// Internal: list member ids (for auto-inviting everyone to an event created
// via the scheduleEvent skill).
export const listMemberIdsInternal = internalQuery({
  args: { groupChatId: v.id("groupChats") },
  handler: async (ctx, { groupChatId }) => {
    const rows = await listMembers(ctx, groupChatId);
    return rows.map((r) => r.userId);
  },
});

// Exposed helper used by groupChatMessages.ts so both mutation files share the
// same membership check. Keep it co-located with the other helpers to avoid
// cross-file recursive imports.
export async function assertMembership(
  ctx: QueryCtx | MutationCtx,
  groupChatId: Id<"groupChats">,
  userId: Id<"users">,
): Promise<Doc<"groupChatMembers">> {
  const m = await getMembership(ctx, groupChatId, userId);
  if (!m) throw new Error("You are not a member of this group");
  return m;
}
