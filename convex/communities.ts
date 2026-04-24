import { v } from "convex/values"
import {
  query,
  mutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { resolveIdentity } from "./lib/identity"
import {
  getCallerUserId,
  requireCommunityRole,
  type CommunityRole,
} from "./_lib/authz"
import { geoBucket, haversineKm, neighborBuckets } from "./_lib/geo"

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

// Slugify a community name — same recipe as `businesses.slugifyName`.
function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base.length > 0 ? base : "community"
}

async function generateUniqueSlug(
  ctx: MutationCtx,
  desired: string,
): Promise<string> {
  const base = slugifyName(desired)
  const existing = await ctx.db
    .query("communities")
    .withIndex("by_slug", (q) => q.eq("slug", base))
    .unique()
  if (!existing) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    const collision = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique()
    if (!collision) return candidate
  }
  return `${base}-${Date.now()}`
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

const CATEGORY_VALIDATOR = v.union(
  v.literal("fitness"),
  v.literal("spiritual"),
  v.literal("hobby"),
  v.literal("academic"),
  v.literal("food"),
  v.literal("social"),
  v.literal("other"),
)

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// Create a new community. The caller becomes the `admin` member and
// `memberCount` is seeded to 1. Location + radius are required so
// `discoverCommunities` can always bucket a new community; dev callers
// can paste a Google Maps link into the form and run
// `parseGoogleMapsLink` to fill them in.
export const createCommunity = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    name: v.string(),
    description: v.string(),
    category: CATEGORY_VALIDATOR,
    locationLat: v.number(),
    locationLng: v.number(),
    locationLabel: v.optional(v.string()),
    locationRadiusKm: v.number(),
    // Optional rich-location metadata. Present when the creator picked
    // a location from the Places search dialog rather than entering
    // lat/lng by hand.
    locationPlaceId: v.optional(v.string()),
    locationMapsUri: v.optional(v.string()),
    locationAddress: v.optional(v.string()),
    locationCity: v.optional(v.string()),
    locationCountry: v.optional(v.string()),
    isPublic: v.boolean(),
    coverImageUrl: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })

    const name = args.name.trim()
    if (name.length < 2) throw new Error("Community name is too short")
    const description = args.description.trim()
    if (description.length === 0) {
      throw new Error("Community description is required")
    }
    if (
      !Number.isFinite(args.locationLat) ||
      args.locationLat < -90 ||
      args.locationLat > 90
    ) {
      throw new Error("Invalid latitude")
    }
    if (
      !Number.isFinite(args.locationLng) ||
      args.locationLng < -180 ||
      args.locationLng > 180
    ) {
      throw new Error("Invalid longitude")
    }
    if (
      !Number.isFinite(args.locationRadiusKm) ||
      args.locationRadiusKm <= 0 ||
      args.locationRadiusKm > 500
    ) {
      throw new Error("Radius must be between 0 and 500 km")
    }

    const slug = await generateUniqueSlug(ctx, name)
    const now = Date.now()

    const communityId = await ctx.db.insert("communities", {
      name,
      slug,
      description,
      category: args.category,
      coverImageUrl: args.coverImageUrl,
      avatarUrl: args.avatarUrl,
      locationLat: args.locationLat,
      locationLng: args.locationLng,
      locationLabel: args.locationLabel,
      locationRadiusKm: args.locationRadiusKm,
      locationPlaceId: args.locationPlaceId,
      locationMapsUri: args.locationMapsUri,
      locationAddress: args.locationAddress,
      locationCity: args.locationCity,
      locationCountry: args.locationCountry,
      isPublic: args.isPublic,
      isPaid: false,
      createdBy: callerId,
      createdAt: now,
      memberCount: 1,
      geoBucket: geoBucket(args.locationLat, args.locationLng),
    })

    await ctx.db.insert("communityMembers", {
      communityId,
      userId: callerId,
      role: "admin",
      joinedAt: now,
      addedBy: callerId,
    })

    // Return both id and slug so the create form can route straight
    // to the detail page without a follow-up lookup.
    return { communityId, slug }
  },
})

// Edit community metadata. Admin only. All fields are optional — only
// supplied keys are patched. If location changes we recompute the
// `geoBucket` so discovery stays accurate.
export const updateCommunity = mutation({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      category: v.optional(CATEGORY_VALIDATOR),
      coverImageUrl: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      locationLat: v.optional(v.number()),
      locationLng: v.optional(v.number()),
      locationLabel: v.optional(v.string()),
      locationRadiusKm: v.optional(v.number()),
      locationPlaceId: v.optional(v.string()),
      locationMapsUri: v.optional(v.string()),
      locationAddress: v.optional(v.string()),
      locationCity: v.optional(v.string()),
      locationCountry: v.optional(v.string()),
      isPublic: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    await requireCommunityRole(ctx, callerId, args.communityId, "admin")

    const community = await ctx.db.get(args.communityId)
    if (!community) throw new Error("Community not found")

    const nextName = args.patch.name?.trim()
    if (nextName !== undefined && nextName.length < 2) {
      throw new Error("Community name is too short")
    }
    const nextDescription = args.patch.description?.trim()
    if (nextDescription !== undefined && nextDescription.length === 0) {
      throw new Error("Community description is required")
    }

    const patch: Partial<Doc<"communities">> = { ...args.patch }
    if (nextName !== undefined) patch.name = nextName
    if (nextDescription !== undefined) patch.description = nextDescription

    const nextLat = args.patch.locationLat ?? community.locationLat
    const nextLng = args.patch.locationLng ?? community.locationLng
    if (
      args.patch.locationLat !== undefined ||
      args.patch.locationLng !== undefined
    ) {
      if (
        !Number.isFinite(nextLat) ||
        nextLat < -90 ||
        nextLat > 90
      ) {
        throw new Error("Invalid latitude")
      }
      if (
        !Number.isFinite(nextLng) ||
        nextLng < -180 ||
        nextLng > 180
      ) {
        throw new Error("Invalid longitude")
      }
      patch.geoBucket = geoBucket(nextLat, nextLng)
    }
    if (args.patch.locationRadiusKm !== undefined) {
      if (
        !Number.isFinite(args.patch.locationRadiusKm) ||
        args.patch.locationRadiusKm <= 0 ||
        args.patch.locationRadiusKm > 500
      ) {
        throw new Error("Radius must be between 0 and 500 km")
      }
    }

    await ctx.db.patch(args.communityId, patch)
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

// Public lookup by slug — used for SSR-friendly community URLs. Returns
// the raw doc; callers that need the viewer's role should call
// `getCommunityForViewer` afterwards.
export const getCommunityBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
  },
})

// Returns the community + the caller's role + their pending join request
// (if any). Non-members get `{ community, myRole: null, pendingRequest }`.
// Join-request status is surfaced here so the detail page can render the
// right CTA (Join / Requested / Declined) without a second round-trip.
export const getCommunityForViewer = query({
  args: {
    devUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const community = await ctx.db.get(args.communityId)
    if (!community) return null
    const membership = await getMembership(ctx, args.communityId, callerId)
    const pendingRequest = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_and_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", callerId),
      )
      .unique()
    return {
      community,
      myRole: (membership?.role ?? null) as CommunityRole | null,
      myUserId: callerId,
      pendingRequest: pendingRequest ?? null,
    }
  },
})

// Communities the caller has any membership in, newest community first.
// Used by the `/dashboard/communities` list page's "My Communities" tab.
export const listMyCommunities = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const memberships = await ctx.db
      .query("communityMembers")
      .withIndex("by_user", (q) => q.eq("userId", callerId))
      .collect()
    const rows = await Promise.all(
      memberships.map(async (m) => {
        const community = await ctx.db.get(m.communityId)
        if (!community) return null
        return {
          community,
          role: m.role as CommunityRole,
        }
      }),
    )
    const out = rows.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    )
    out.sort((a, b) => b.community.createdAt - a.community.createdAt)
    return out
  },
})

// Discover public communities near a (lat, lng) within `radiusKm`. Scans
// this bucket + the 8 neighbours (~33 km box) then applies a precise
// haversine filter; the effective radius per community is
//   args.radiusKm + community.locationRadiusKm
// so a community with a wide radius can be discovered by users outside
// its centre. Optional `category` narrows the list.
export const discoverCommunities = query({
  args: {
    devUserId: v.optional(v.id("users")),
    lat: v.number(),
    lng: v.number(),
    radiusKm: v.number(),
    category: v.optional(CATEGORY_VALIDATOR),
  },
  handler: async (ctx, args) => {
    // Identity is required even for discovery — the list is still keyed
    // on the viewer (they may already be members of some matches).
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })

    if (
      !Number.isFinite(args.lat) ||
      args.lat < -90 ||
      args.lat > 90 ||
      !Number.isFinite(args.lng) ||
      args.lng < -180 ||
      args.lng > 180
    ) {
      throw new Error("Invalid coordinates")
    }
    if (!Number.isFinite(args.radiusKm) || args.radiusKm <= 0) {
      throw new Error("radiusKm must be > 0")
    }

    const origin = { lat: args.lat, lng: args.lng }
    const buckets = neighborBuckets(geoBucket(args.lat, args.lng))

    // Fetch all candidates via the bucket index. Duplicates across
    // bucket boundaries aren't possible (each community lives in
    // exactly one bucket) so we can safely concat.
    const seen = new Set<string>()
    const candidates: Doc<"communities">[] = []
    for (const bucket of buckets) {
      const rows = await ctx.db
        .query("communities")
        .withIndex("by_geoBucket", (q) => q.eq("geoBucket", bucket))
        .take(200)
      for (const row of rows) {
        if (seen.has(row._id)) continue
        seen.add(row._id)
        candidates.push(row)
      }
    }

    type DiscoveredRow = {
      community: Doc<"communities">
      distanceKm: number
      myRole: CommunityRole | null
      pendingRequest: boolean
    }

    const results: DiscoveredRow[] = []
    for (const c of candidates) {
      if (!c.isPublic) continue
      if (args.category !== undefined && c.category !== args.category) {
        continue
      }
      const d = haversineKm(origin, {
        lat: c.locationLat,
        lng: c.locationLng,
      })
      // Effective radius: viewer's search radius + community's own
      // reach. Either can be wide enough to justify including the row.
      const effectiveKm = args.radiusKm + c.locationRadiusKm
      if (d > effectiveKm) continue
      const membership = await getMembership(ctx, c._id, callerId)
      const pending = membership
        ? false
        : !!(await ctx.db
            .query("communityJoinRequests")
            .withIndex("by_community_and_user", (q) =>
              q.eq("communityId", c._id).eq("userId", callerId),
            )
            .unique()
            .then((r) => r && r.status === "pending"))
      results.push({
        community: c,
        distanceKm: d,
        myRole: (membership?.role ?? null) as CommunityRole | null,
        pendingRequest: pending,
      })
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm)
    return results
  },
})

// Text search across public communities. Matches the query against both the
// community name AND the city field in parallel, then merges + dedupes. Used
// by the Discover tab's simple search bar; for geospatial "near me" search
// use `discoverCommunities` instead.
export const searchCommunitiesByText = query({
  args: {
    devUserId: v.optional(v.id("users")),
    query: v.string(),
    category: v.optional(CATEGORY_VALIDATOR),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await resolveCallerId(ctx, {
      devUserId: args.devUserId,
    })
    const q = args.query.trim()
    if (q.length === 0) return []
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50)

    // Two parallel full-text queries. Each search index already filters
    // to `isPublic: true` and (optionally) the requested category.
    const runSearch = async (indexName: "search_name" | "search_city") =>
      await ctx.db
        .query("communities")
        .withSearchIndex(indexName, (sq) => {
          let builder = sq.search(
            indexName === "search_name" ? "name" : "locationCity",
            q,
          )
          builder = builder.eq("isPublic", true)
          if (args.category !== undefined) {
            builder = builder.eq("category", args.category)
          }
          return builder
        })
        .take(limit)

    const [byName, byCity] = await Promise.all([
      runSearch("search_name"),
      runSearch("search_city"),
    ])

    // Merge, preserving name-hit order first (higher intent signal) and
    // deduping by _id.
    const seen = new Set<string>()
    const merged: Doc<"communities">[] = []
    for (const row of [...byName, ...byCity]) {
      if (seen.has(row._id)) continue
      seen.add(row._id)
      merged.push(row)
      if (merged.length >= limit) break
    }

    // Enrich with the caller's role + pending-request state so cards can
    // render the right CTA (same shape as `discoverCommunities`).
    const enriched = await Promise.all(
      merged.map(async (c) => {
        const membership = await getMembership(ctx, c._id, callerId)
        const pending = membership
          ? false
          : !!(await ctx.db
              .query("communityJoinRequests")
              .withIndex("by_community_and_user", (qq) =>
                qq.eq("communityId", c._id).eq("userId", callerId),
              )
              .unique()
              .then((r) => r && r.status === "pending"))
        return {
          community: c,
          myRole: (membership?.role ?? null) as CommunityRole | null,
          pendingRequest: pending,
        }
      }),
    )
    return enriched
  },
})

// Dev-only listing for `/dev/billing`. Mirrors `businesses.listAllForDev`.
// Gated on CONVEX_DEV_MODE so it never runs in prod.
export const listAllForDev = query({
  args: { devUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    await resolveIdentity(ctx, { devUserId: args.devUserId })
    if (process.env.CONVEX_DEV_MODE !== "true") {
      throw new Error("listAllForDev is only available in dev mode")
    }
    const rows = await ctx.db.query("communities").take(500)
    return rows
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

// List every member id for a community. Used by internal notification /
// fanout paths (announcement post → notify all members, etc.).
export const listMemberIdsInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_community", (q) => q.eq("communityId", communityId))
      .collect()
    return rows.map((r) => r.userId)
  },
})

// List admin user ids for a community. Used by `requestJoin` to fan out
// `community_join_request` notifications to the admin set.
export const listAdminIdsInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_community_and_role", (q) =>
        q.eq("communityId", communityId).eq("role", "admin"),
      )
      .collect()
    return rows.map((r) => r.userId)
  },
})

// Communities the asker is a member of, plus their role. Used by chat tools
// that can't read ctx.auth (actions) and need to enumerate without the
// resolveCallerId Clerk detour.
export const listMyCommunitiesInternal = internalQuery({
  args: { askerId: v.id("users") },
  handler: async (ctx, { askerId }) => {
    const memberships = await ctx.db
      .query("communityMembers")
      .withIndex("by_user", (q) => q.eq("userId", askerId))
      .collect()
    const out: Array<{
      community: Doc<"communities">
      role: CommunityRole
    }> = []
    for (const m of memberships) {
      const c = await ctx.db.get(m.communityId)
      if (!c) continue
      out.push({ community: c, role: m.role as CommunityRole })
    }
    out.sort((a, b) => b.community.createdAt - a.community.createdAt)
    return out
  },
})

// Substring match on community name, limited to communities the asker is a
// member of. Case-insensitive. Used so the chat tool can resolve a
// natural-language community name ("my running group") to an id.
export const findCommunityByNameForUserInternal = internalQuery({
  args: {
    askerId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const needle = args.query.trim().toLowerCase()
    if (!needle) return []
    const memberships = await ctx.db
      .query("communityMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.askerId))
      .collect()
    const matches: Array<{
      community: Doc<"communities">
      role: CommunityRole
    }> = []
    for (const m of memberships) {
      const c = await ctx.db.get(m.communityId)
      if (!c) continue
      if (!c.name.toLowerCase().includes(needle)) continue
      matches.push({ community: c, role: m.role as CommunityRole })
    }
    return matches.slice(0, Math.min(args.limit ?? 6, 20))
  },
})
