import { mutation, query, internalQuery, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// Visibility helpers — used by `getUserForViewer` to filter profile content
// based on the viewer's actual relationship to the owner. Duplicated here
// (rather than imported from friends.ts) to keep this file self-contained.
// ─────────────────────────────────────────────────────────────────────────────

type VisibilityTag = "close" | "friends" | "mutual" | "none";
type ViewerRelationship = "self" | "close" | "friend" | "mutual" | "none";

async function resolveViewerRelationship(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  ownerId: Id<"users">,
): Promise<ViewerRelationship> {
  if (viewerId === ownerId) return "self";
  // The tier is owner-side. To know whether `viewer` is a close friend OF
  // `owner`, look at the edge row that `owner` owns, pointing to `viewer`.
  const edge = await ctx.db
    .query("friends")
    .withIndex("by_user_and_friend", (q) =>
      q.eq("userId", ownerId).eq("friendId", viewerId),
    )
    .unique();
  if (edge?.status === "accepted") {
    return edge.tier === "close" ? "close" : "friend";
  }
  // Not accepted friends — check for a mutual friend.
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

function canSee(rel: ViewerRelationship, tag: VisibilityTag): boolean {
  if (rel === "self") return true;
  if (tag === "none") return false;
  if (tag === "close") return rel === "close";
  if (tag === "friends") return rel === "close" || rel === "friend";
  if (tag === "mutual") {
    return rel === "close" || rel === "friend" || rel === "mutual";
  }
  return false;
}

// User queries
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
  },
});

export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
  },
});

// Returns a target user's profile doc with visibility-gated arrays and
// nested objects pre-filtered for the viewer. Always use this (not the raw
// users.get) when rendering someone else's profile.
//
// Contract:
//   - Name / username / avatar / bio / location / visibility / currentStatus
//     are always returned (they carry no per-field visibility in the schema).
//   - Email and DOB are only returned when viewer === owner (PII guard).
//   - interests / media / places / projects are filtered by each item's
//     `visibility` tag against the viewer's relationship.
//   - workplace / school are returned only when their visibility tag allows.
//   - `relationship` tells the caller the bucket we landed in so the UI can
//     adapt without re-querying.
export const getUserForViewer = query({
  args: {
    viewerId: v.id("users"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, { viewerId, targetUserId }) => {
    const target = await ctx.db.get(targetUserId);
    if (!target) return null;
    const rel = await resolveViewerRelationship(ctx, viewerId, targetUserId);

    const interests = (target.interests ?? []).filter((i) =>
      canSee(rel, i.visibility),
    );
    const media = (target.media ?? []).filter((i) =>
      canSee(rel, i.visibility),
    );
    const places = (target.places ?? []).filter((i) =>
      canSee(rel, i.visibility),
    );
    const projects = (target.projects ?? []).filter((i) =>
      canSee(rel, i.visibility),
    );
    const workplace =
      target.workplace && canSee(rel, target.workplace.visibility)
        ? target.workplace
        : undefined;
    const school =
      target.school && canSee(rel, target.school.visibility)
        ? target.school
        : undefined;

    return {
      _id: target._id,
      _creationTime: target._creationTime,
      name: target.name,
      username: target.username,
      email: rel === "self" ? target.email : undefined,
      dob: rel === "self" ? target.dob : undefined,
      avatar: target.avatar,
      bio: target.bio,
      location: target.location,
      visibility: target.visibility,
      currentStatus: target.currentStatus,
      interests,
      media,
      places,
      projects,
      workplace,
      school,
      relationship: rel,
    };
  },
});

// Prefix search over `username`. Backed by the by_username index using a
// range scan: `gte(prefix) && lt(prefix + "\uffff")` matches every username
// that starts with `prefix`.
export const searchUsersByUsername = query({
  args: {
    prefix: v.string(),
    excludeUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { prefix, excludeUserId, limit }) => {
    const p = prefix.trim().toLowerCase();
    if (!p) return [];
    const cap = Math.min(limit ?? 20, 50);
    const rows = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.gte("username", p).lt("username", p + "\uffff"),
      )
      .take(cap + (excludeUserId ? 1 : 0));
    return excludeUserId
      ? rows.filter((r) => r._id !== excludeUserId).slice(0, cap)
      : rows.slice(0, cap);
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

// User mutations
export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    dob: v.string(),
    avatar: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
    currentStatus: v.optional(v.array(v.union(v.literal("work"), v.literal("study")))),
    interests: v.optional(v.array(v.object({
      value: v.string(),
      visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
    }))),
    media: v.optional(v.array(v.object({
      title: v.string(),
      type: v.union(v.literal("music"), v.literal("movie"), v.literal("book"), v.literal("novel"), v.literal("series"), v.literal("podcast"), v.literal("anime"), v.literal("game"), v.literal("other")),
      visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      externalSource: v.optional(v.union(v.literal("spotify"), v.literal("itunes"), v.literal("tvmaze"), v.literal("openlibrary"), v.literal("jikan"), v.literal("cheapshark"))),
      externalId: v.optional(v.string()),
      externalKind: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
    }))),
    places: v.optional(v.array(v.object({
      name: v.string(),
      type: v.union(v.literal("restaurant"), v.literal("cafe"), v.literal("bar"), v.literal("park"), v.literal("gym"), v.literal("library"), v.literal("store"), v.literal("hangout"), v.literal("other")),
      mapsLink: v.optional(v.string()),
      address: v.optional(v.string()),
      tags: v.array(v.string()),
      visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
    }))),
    projects: v.optional(v.array(v.object({
      title: v.string(),
      tags: v.array(v.string()),
      description: v.optional(v.string()),
      visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
    }))),
    workplace: v.optional(v.object({
      name: v.optional(v.string()),
      mapsLink: v.optional(v.string()),
      visibility: v.union(v.literal("close"), v.literal("none")),
    })),
    school: v.optional(v.object({
      name: v.optional(v.string()),
      mapsLink: v.optional(v.string()),
      visibility: v.union(v.literal("close"), v.literal("none")),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", args);
    await ctx.scheduler.runAfter(0, internal.embeddings.reindexUser, { userId });
    return userId;
  },
});

export const updateUser = mutation({
  args: { 
    userId: v.id("users"),
    updates: v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      dob: v.optional(v.string()),
      avatar: v.optional(v.string()),
      bio: v.optional(v.string()),
      location: v.optional(v.string()),
      visibility: v.optional(v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none"))),
      currentStatus: v.optional(v.array(v.union(v.literal("work"), v.literal("study")))),
      interests: v.optional(v.array(v.object({
        value: v.string(),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      }))),
      media: v.optional(v.array(v.object({
        title: v.string(),
        type: v.union(v.literal("music"), v.literal("movie"), v.literal("book"), v.literal("novel"), v.literal("series"), v.literal("podcast"), v.literal("anime"), v.literal("game"), v.literal("other")),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
        externalSource: v.optional(v.union(v.literal("spotify"), v.literal("itunes"), v.literal("tvmaze"), v.literal("openlibrary"), v.literal("jikan"), v.literal("cheapshark"))),
        externalId: v.optional(v.string()),
        externalKind: v.optional(v.string()),
        subtitle: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
      }))),
      places: v.optional(v.array(v.object({
        name: v.string(),
        type: v.union(v.literal("restaurant"), v.literal("cafe"), v.literal("bar"), v.literal("park"), v.literal("gym"), v.literal("library"), v.literal("store"), v.literal("hangout"), v.literal("other")),
        mapsLink: v.optional(v.string()),
        address: v.optional(v.string()),
        tags: v.array(v.string()),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      }))),
      projects: v.optional(v.array(v.object({
        title: v.string(),
        tags: v.array(v.string()),
        description: v.optional(v.string()),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      }))),
      workplace: v.optional(v.object({
        name: v.optional(v.string()),
        mapsLink: v.optional(v.string()),
        visibility: v.union(v.literal("close"), v.literal("none")),
      })),
      school: v.optional(v.object({
        name: v.optional(v.string()),
        mapsLink: v.optional(v.string()),
        visibility: v.union(v.literal("close"), v.literal("none")),
      })),
    }),
  },
  handler: async (ctx, { userId, updates }) => {
    await ctx.db.patch(userId, updates);
    await ctx.scheduler.runAfter(0, internal.embeddings.reindexUser, { userId });
    return userId;
  },
});

// Internal user query
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

// Used by `resolveIdentity` when running inside an action ctx — actions
// don't expose `ctx.db`, so we pay a single runQuery hop to fetch the
// dev-selected user's row.
export const getUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

// Get or create user by email (for Clerk auth integration).
//
// Clerk's username is mirrored into our row every call so the Convex copy
// stays in sync if it changes upstream. Uniqueness is enforced here because
// Convex has no native unique constraint.
export const getOrCreateUser = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedUsername = args.username?.trim().toLowerCase();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      const patch: { username?: string; name?: string } = {};
      if (
        normalizedUsername &&
        normalizedUsername !== existingUser.username
      ) {
        const collision = await ctx.db
          .query("users")
          .withIndex("by_username", (q) =>
            q.eq("username", normalizedUsername),
          )
          .unique();
        if (collision && collision._id !== existingUser._id) {
          throw new Error(
            `Username "${normalizedUsername}" is already taken`,
          );
        }
        patch.username = normalizedUsername;
      }
      // Mirror Clerk's current name into Convex so friends lists, chat
      // avatars, and @mentions always show the authoritative name.
      if (args.name && args.name.trim() && args.name !== existingUser.name) {
        patch.name = args.name.trim();
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existingUser._id, patch);
      }
      return existingUser._id;
    }

    if (normalizedUsername) {
      const collision = await ctx.db
        .query("users")
        .withIndex("by_username", (q) =>
          q.eq("username", normalizedUsername),
        )
        .unique();
      if (collision) {
        throw new Error(
          `Username "${normalizedUsername}" is already taken`,
        );
      }
    }

    const userId = await ctx.db.insert("users", {
      name: args.name ?? "User",
      email: args.email,
      username: normalizedUsername,
      dob: "",
      visibility: "friends",
    });

    return userId;
  },
});

// Update user profile and trigger embedding generation
export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    profile: v.object({
      name: v.optional(v.string()),
      dob: v.optional(v.string()),
      visibility: v.optional(v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none"))),
      currentStatus: v.optional(v.array(v.union(v.literal("work"), v.literal("study")))),
      interests: v.optional(v.array(v.object({
        value: v.string(),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      }))),
      media: v.optional(v.array(v.object({
        title: v.string(),
        type: v.union(v.literal("music"), v.literal("movie"), v.literal("book"), v.literal("novel"), v.literal("series"), v.literal("podcast"), v.literal("anime"), v.literal("game"), v.literal("other")),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
        externalSource: v.optional(v.union(v.literal("spotify"), v.literal("itunes"), v.literal("tvmaze"), v.literal("openlibrary"), v.literal("jikan"), v.literal("cheapshark"))),
        externalId: v.optional(v.string()),
        externalKind: v.optional(v.string()),
        subtitle: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
      }))),
      places: v.optional(v.array(v.object({
        name: v.string(),
        type: v.union(v.literal("restaurant"), v.literal("cafe"), v.literal("bar"), v.literal("park"), v.literal("gym"), v.literal("library"), v.literal("store"), v.literal("hangout"), v.literal("other")),
        mapsLink: v.optional(v.string()),
        address: v.optional(v.string()),
        tags: v.array(v.string()),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      }))),
      projects: v.optional(v.array(v.object({
        title: v.string(),
        tags: v.array(v.string()),
        description: v.optional(v.string()),
        visibility: v.union(v.literal("close"), v.literal("friends"), v.literal("mutual"), v.literal("none")),
      }))),
      workplace: v.optional(v.object({
        name: v.optional(v.string()),
        mapsLink: v.optional(v.string()),
        visibility: v.union(v.literal("close"), v.literal("none")),
      })),
      school: v.optional(v.object({
        name: v.optional(v.string()),
        mapsLink: v.optional(v.string()),
        visibility: v.union(v.literal("close"), v.literal("none")),
      })),
    }),
  },
  handler: async (ctx, { userId, profile }) => {
    // Update user profile
    await ctx.db.patch(userId, profile);
    await ctx.scheduler.runAfter(0, internal.embeddings.reindexUser, { userId });
    return userId;
  },
});
