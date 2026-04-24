import { mutation, query, internalQuery, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { resolveIdentity } from "./lib/identity";

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

// Used by Node-runtime actions (`convex/r2.ts`) that don't have ctx.db and
// need to resolve an authenticated identity's email to our users row.
export const getUserByEmailInternal = internalQuery({
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
    const eventInterests = (target.eventInterests ?? []).filter((i) =>
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
      eventInterests,
      media,
      places,
      projects,
      workplace,
      school,
      relationship: rel,
    };
  },
});

// Broader user search across `name`, `username`, and `email`. Used by
// surfaces that need a people-picker (e.g. community admin adding members).
// Runs three prefix-style scans in parallel and merges results \u2014 the
// `by_username` and `email` indexes get prefix range scans; `name` is
// scanned with a case-insensitive `includes` over a capped slice because
// there is no name index.
//
// Callers can pass `excludeUserIds` to filter out users the UI already
// knows should be omitted (e.g. existing members / invitees).
export const searchDiscoverable = query({
  args: {
    query: v.string(),
    excludeUserIds: v.optional(v.array(v.id("users"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const q = args.query.trim().toLowerCase();
    if (q.length === 0) return [];
    const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const exclude = new Set<Id<"users">>(args.excludeUserIds ?? []);

    // Prefix scan over username (stripping a leading @ if present).
    const usernameNeedle = q.replace(/^@/, "");
    const byUsername = usernameNeedle
      ? await ctx.db
          .query("users")
          .withIndex("by_username", (b) =>
            b
              .gte("username", usernameNeedle)
              .lt("username", usernameNeedle + "\uffff"),
          )
          .take(cap * 2)
      : [];

    // Prefix scan over email (lowercase \u2014 our emails are stored lowercase
    // because Clerk hands us lowercase addresses).
    const byEmail = q.includes("@") || /[a-z0-9.+-]/.test(q)
      ? await ctx.db
          .query("users")
          .withIndex("email", (b) =>
            b.gte("email", q).lt("email", q + "\uffff"),
          )
          .take(cap * 2)
      : [];

    // Name: no index, so cap at 500 rows to stay within query limits. This
    // is only used as a last-resort fallback when the first two don't
    // produce enough hits \u2014 for typical username/email searches the above
    // indexes are sufficient.
    let byName: Doc<"users">[] = [];
    if (byUsername.length + byEmail.length < cap) {
      const scanned = await ctx.db.query("users").take(500);
      byName = scanned.filter((u) =>
        u.name.toLowerCase().includes(q),
      );
    }

    const seen = new Set<string>();
    const merged: Doc<"users">[] = [];
    for (const row of [...byUsername, ...byEmail, ...byName]) {
      if (seen.has(row._id)) continue;
      if (exclude.has(row._id)) continue;
      seen.add(row._id);
      merged.push(row);
      if (merged.length >= cap) break;
    }

    return merged.map((u) => ({
      _id: u._id,
      name: u.name,
      username: u.username ?? null,
      email: u.email,
      avatar: u.avatar ?? null,
    }));
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
    eventInterests: v.optional(v.array(v.object({
      value: v.string(),
      custom: v.boolean(),
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
      imageUrl: v.optional(v.string()),
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
      eventInterests: v.optional(v.array(v.object({
        value: v.string(),
        custom: v.boolean(),
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
        imageUrl: v.optional(v.string()),
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

// Batch-fetch users for enrichment inside action-tool executes. Ordering
// mirrors the input; nulls are preserved for missing ids so callers can
// zip against their source array.
export const listUsersByIdsInternal = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }): Promise<Array<Doc<"users"> | null>> => {
    return await Promise.all(userIds.map((id) => ctx.db.get(id)));
  },
});

// Get or create user by email (for Clerk auth integration).
//
// Clerk's username is mirrored into our row every call so the Convex copy
// stays in sync if it changes upstream. Uniqueness is enforced here because
// Convex has no native unique constraint.
//
// `accountType` is set on INSERT only. It's never overwritten on subsequent
// calls — the signup-intent is immutable (a user can still be added to a
// business as a member via `businessMembers` regardless of their own
// accountType). New rows that don't pass `accountType` default to "personal".
export const getOrCreateUser = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    avatar: v.optional(v.string()),
    accountType: v.optional(
      v.union(v.literal("personal"), v.literal("business")),
    ),
  },
  handler: async (ctx, args) => {
    const normalizedUsername = args.username?.trim().toLowerCase();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      const patch: {
        username?: string;
        name?: string;
        avatar?: string;
        accountType?: "personal" | "business";
      } = {};
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
      // Avatar: only backfill from Clerk when the Convex row has no avatar
      // yet. Once the user has set a custom avatar (via R2 upload in
      // /dashboard/profile, see `setAvatar` below), we NEVER clobber it on
      // subsequent bootstraps — otherwise the next dashboard load would
      // silently restore the stale Clerk URL and wipe out the upload.
      if (args.avatar && !existingUser.avatar) {
        patch.avatar = args.avatar;
      }
      // Backfill accountType for pre-existing rows that never had the
      // field set, but NEVER overwrite an already-set value.
      if (
        args.accountType &&
        existingUser.accountType === undefined
      ) {
        patch.accountType = args.accountType;
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
      avatar: args.avatar,
      accountType: args.accountType ?? "personal",
      dob: "",
      visibility: "friends",
    });

    return userId;
  },
});

// Set the authenticated caller's avatar. Used by `/dashboard/profile` →
// `<ProfilePhotoUpload />` after the browser uploads the image directly to
// R2 via `api.r2.generateUploadUrl`. The caller identity is derived server-
// side via `resolveIdentity` (prod Clerk or dev switcher) — never accept a
// target `userId` as an arg, otherwise a malicious client could set someone
// else's avatar.
//
// `avatar` is a plain string URL. Pass `null` to clear the avatar (falls
// back to the initials placeholder in the UI). We accept `v.union(v.string,
// v.null)` rather than `v.optional(v.string)` so a null value actually
// round-trips to Convex — `undefined` would be dropped by the arg validator.
export const setAvatar = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    avatar: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { devUserId, avatar }) => {
    const identity = await resolveIdentity(ctx, { devUserId });
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) throw new Error("User not found for identity");
    // Basic sanity check — the URL should at minimum look like an absolute
    // URL. Skip the check when clearing (avatar === null).
    if (avatar !== null) {
      if (!/^https?:\/\//i.test(avatar)) {
        throw new Error("Avatar URL must be http(s)");
      }
      if (avatar.length > 2048) throw new Error("Avatar URL is too long");
    }
    await ctx.db.patch(user._id, { avatar: avatar ?? undefined });
    return user._id;
  },
});

// Returns the account type for a user, defaulting to "personal" for any row
// created before the field existed. Cheap read — used by the sidebar to
// decide which nav items to show and by the profile page to pick which
// form variant to render.
export const getAccountType = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return (user.accountType ?? "personal") as "personal" | "business";
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
      eventInterests: v.optional(v.array(v.object({
        value: v.string(),
        custom: v.boolean(),
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
        imageUrl: v.optional(v.string()),
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
