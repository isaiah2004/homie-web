import { mutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"

// ─────────────────────────────────────────────────────────────────────────────
// Dev seed — populate the local Convex deployment with realistic test users
// so the floating dev switcher has something to play with.
//
// Idempotent: each user has a fixed `username` prefixed with `dev_` (friends)
// or `dev_biz_` (businesses). Re-running the mutation upserts by username so
// you can iterate on seed content without nuking existing `friends` /
// `conversations` rows that reference the ids.
//
// Only callable when CONVEX_DEV_MODE === "true" on the deployment.
// ─────────────────────────────────────────────────────────────────────────────

type VisibilityTag = "close" | "friends" | "mutual" | "none"
type WorkSchoolVisibility = "close" | "none"

type SeedUser = {
  username: string
  name: string
  email: string
  dob: string
  bio?: string
  location?: string
  visibility: VisibilityTag
  currentStatus?: Array<"work" | "study">
  interests?: Array<{ value: string; visibility: VisibilityTag }>
  media?: Array<{
    title: string
    type:
      | "music"
      | "movie"
      | "book"
      | "novel"
      | "series"
      | "podcast"
      | "anime"
      | "game"
      | "other"
    visibility: VisibilityTag
    externalSource?:
      | "spotify"
      | "itunes"
      | "tvmaze"
      | "openlibrary"
      | "jikan"
      | "cheapshark"
    externalId?: string
    externalKind?: string
    subtitle?: string
    imageUrl?: string
  }>
  places?: Array<{
    name: string
    type:
      | "restaurant"
      | "cafe"
      | "bar"
      | "park"
      | "gym"
      | "library"
      | "store"
      | "hangout"
      | "other"
    mapsLink?: string
    address?: string
    tags: string[]
    visibility: VisibilityTag
  }>
  projects?: Array<{
    title: string
    tags: string[]
    description?: string
    visibility: VisibilityTag
  }>
  workplace?: {
    name?: string
    mapsLink?: string
    visibility: WorkSchoolVisibility
  }
  school?: {
    name?: string
    mapsLink?: string
    visibility: WorkSchoolVisibility
  }
}

const FRIENDS: SeedUser[] = [
  {
    username: "dev_ankith",
    name: "Ankith Mathew",
    email: "ankith@dev.homie",
    dob: "1997-03-12",
    bio: "Weekend cyclist, film nerd.",
    location: "Bangalore",
    visibility: "friends",
    currentStatus: ["work"],
    interests: [
      { value: "photography", visibility: "friends" },
      { value: "cycling", visibility: "close" },
      { value: "indie games", visibility: "friends" },
    ],
    media: [
      {
        title: "(No One Knows Me) Like the Piano",
        type: "music",
        visibility: "friends",
        externalSource: "spotify",
        externalKind: "track",
        subtitle: "Sampha",
      },
      {
        title: "Everything Everywhere All at Once",
        type: "movie",
        visibility: "friends",
        externalSource: "itunes",
        subtitle: "A24 · 2022",
      },
      {
        title: "The Overstory",
        type: "book",
        visibility: "friends",
        externalSource: "openlibrary",
        subtitle: "Richard Powers",
      },
    ],
    places: [
      {
        name: "Third Wave Coffee Indiranagar",
        type: "cafe",
        tags: ["wfh", "pourover"],
        visibility: "friends",
      },
    ],
    projects: [
      {
        title: "homie",
        tags: ["web", "nextjs", "convex"],
        description: "Social graph for people who prefer calmer internet.",
        visibility: "friends",
      },
    ],
    workplace: { name: "Homie", visibility: "close" },
  },
  {
    username: "dev_priya",
    name: "Priya Raman",
    email: "priya@dev.homie",
    dob: "1999-08-22",
    bio: "Designer + plant parent.",
    location: "Bangalore",
    visibility: "friends",
    currentStatus: ["work"],
    interests: [
      { value: "design", visibility: "friends" },
      { value: "ceramics", visibility: "friends" },
      { value: "hiking", visibility: "mutual" },
    ],
    media: [
      {
        title: "In Rainbows",
        type: "music",
        visibility: "friends",
        externalSource: "spotify",
        externalKind: "album",
        subtitle: "Radiohead",
      },
      {
        title: "Fleabag",
        type: "series",
        visibility: "friends",
        externalSource: "tvmaze",
        subtitle: "BBC Three · 2016",
      },
      {
        title: "Bird by Bird",
        type: "book",
        visibility: "friends",
        externalSource: "openlibrary",
        subtitle: "Anne Lamott",
      },
    ],
    places: [
      {
        name: "Cubbon Park",
        type: "park",
        tags: ["walk", "weekend"],
        visibility: "friends",
      },
    ],
    projects: [
      {
        title: "Kiln — ceramic marketplace",
        tags: ["design", "marketplace"],
        description: "A tiny Shopify for independent ceramicists.",
        visibility: "close",
      },
    ],
  },
  {
    username: "dev_arjun",
    name: "Arjun Kapoor",
    email: "arjun@dev.homie",
    dob: "1995-11-04",
    bio: "Climbing, coffee, Kubernetes.",
    location: "Mumbai",
    visibility: "friends",
    currentStatus: ["work"],
    interests: [
      { value: "climbing", visibility: "friends" },
      { value: "coffee", visibility: "friends" },
      { value: "devops", visibility: "friends" },
    ],
    media: [
      {
        title: "Currents",
        type: "music",
        visibility: "friends",
        externalSource: "spotify",
        externalKind: "album",
        subtitle: "Tame Impala",
      },
      {
        title: "Dune: Part Two",
        type: "movie",
        visibility: "friends",
        externalSource: "itunes",
        subtitle: "Legendary · 2024",
      },
      {
        title: "Designing Data-Intensive Applications",
        type: "book",
        visibility: "friends",
        externalSource: "openlibrary",
        subtitle: "Martin Kleppmann",
      },
    ],
    places: [
      {
        name: "The Bluff Bouldering Gym",
        type: "gym",
        tags: ["bouldering", "weeknight"],
        visibility: "friends",
      },
    ],
    projects: [
      {
        title: "k8s-at-home",
        tags: ["kubernetes", "homelab"],
        description: "Personal cluster running media + home automation.",
        visibility: "friends",
      },
    ],
    workplace: { name: "Razorpay", visibility: "close" },
  },
  {
    username: "dev_sana",
    name: "Sana Iqbal",
    email: "sana@dev.homie",
    dob: "2000-01-30",
    bio: "MS in ML. Runs on filter coffee.",
    location: "Chennai",
    visibility: "friends",
    currentStatus: ["study"],
    interests: [
      { value: "machine learning", visibility: "friends" },
      { value: "filter coffee", visibility: "friends" },
      { value: "birdwatching", visibility: "mutual" },
    ],
    media: [
      {
        title: "For Emma, Forever Ago",
        type: "music",
        visibility: "friends",
        externalSource: "spotify",
        externalKind: "album",
        subtitle: "Bon Iver",
      },
      {
        title: "Arrival",
        type: "movie",
        visibility: "friends",
        externalSource: "itunes",
        subtitle: "Paramount · 2016",
      },
      {
        title: "Attack on Titan",
        type: "anime",
        visibility: "friends",
        externalSource: "jikan",
        subtitle: "Wit Studio · 2013",
      },
    ],
    places: [
      {
        name: "Besant Nagar Beach",
        type: "hangout",
        tags: ["evening", "walk"],
        visibility: "friends",
      },
    ],
    projects: [
      {
        title: "Thesis — few-shot reasoning probes",
        tags: ["research", "ml"],
        description: "Diagnosing where small LMs break on chain-of-thought.",
        visibility: "close",
      },
    ],
    school: { name: "IIT Madras", visibility: "close" },
  },
  {
    username: "dev_kavya",
    name: "Kavya Menon",
    email: "kavya@dev.homie",
    dob: "1998-05-18",
    bio: "Stand-up comic, full-time recruiter.",
    location: "Kochi",
    visibility: "friends",
    currentStatus: ["work"],
    interests: [
      { value: "stand-up comedy", visibility: "friends" },
      { value: "kayaking", visibility: "friends" },
      { value: "k-dramas", visibility: "close" },
    ],
    media: [
      {
        title: "Midnights",
        type: "music",
        visibility: "friends",
        externalSource: "spotify",
        externalKind: "album",
        subtitle: "Taylor Swift",
      },
      {
        title: "The Office",
        type: "series",
        visibility: "friends",
        externalSource: "tvmaze",
        subtitle: "NBC · 2005",
      },
      {
        title: "Crying in H Mart",
        type: "book",
        visibility: "friends",
        externalSource: "openlibrary",
        subtitle: "Michelle Zauner",
      },
    ],
    places: [
      {
        name: "Fort Kochi Promenade",
        type: "hangout",
        tags: ["sunset", "walk"],
        visibility: "friends",
      },
    ],
    projects: [
      {
        title: "Open Mic Kochi",
        tags: ["comedy", "community"],
        description: "Monthly open mic night — ten comics, one bar.",
        visibility: "friends",
      },
    ],
  },
]

const BUSINESSES: SeedUser[] = [
  {
    username: "dev_biz_kinara",
    name: "Kinara Kitchen",
    email: "hello@kinarakitchen.in",
    dob: "",
    bio: "[BUSINESS] South Indian restaurant. Indiranagar, Bangalore.",
    location: "Indiranagar, Bangalore",
    visibility: "friends",
    interests: [
      { value: "restaurant", visibility: "friends" },
      { value: "south-indian", visibility: "friends" },
      { value: "cozy", visibility: "friends" },
    ],
  },
  {
    username: "dev_biz_thirdwave",
    name: "Third Wave Coffee",
    email: "hi@thirdwavecoffee.in",
    dob: "",
    bio: "[BUSINESS] Specialty coffee chain.",
    location: "Bangalore",
    visibility: "friends",
    interests: [
      { value: "cafe", visibility: "friends" },
      { value: "specialty-coffee", visibility: "friends" },
      { value: "wfh-friendly", visibility: "friends" },
    ],
  },
  {
    username: "dev_biz_blrfilm",
    name: "Bangalore Film Society",
    email: "hello@blrfilm.org",
    dob: "",
    bio: "[BUSINESS] Film screenings and culture.",
    location: "Bangalore",
    visibility: "friends",
    interests: [
      { value: "cinema", visibility: "friends" },
      { value: "community", visibility: "friends" },
      { value: "culture", visibility: "friends" },
    ],
  },
]

export const seedDevDataPublic = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.CONVEX_DEV_MODE !== "true") {
      throw new Error("Dev seed is only available in dev mode")
    }

    const all: SeedUser[] = [...FRIENDS, ...BUSINESSES]
    const results: Array<{
      _id: Id<"users">
      username: string
      name: string
    }> = []
    let inserted = 0
    let updated = 0

    for (const seed of all) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", seed.username))
        .unique()

      if (existing) {
        // Only reindex if embedding-relevant fields actually changed.
        // Without this, clicking "Seed data" repeatedly stampedes 8 OpenAI
        // embed calls + Qdrant upserts per click, burning credits and
        // accumulating background action failures when keys are absent.
        const embeddingInputBefore = JSON.stringify({
          bio: existing.bio ?? "",
          location: existing.location ?? "",
          interests: existing.interests ?? [],
          media: existing.media ?? [],
          places: existing.places ?? [],
          projects: existing.projects ?? [],
          workplace: existing.workplace ?? null,
          school: existing.school ?? null,
        })
        const embeddingInputAfter = JSON.stringify({
          bio: seed.bio ?? "",
          location: seed.location ?? "",
          interests: seed.interests ?? [],
          media: seed.media ?? [],
          places: seed.places ?? [],
          projects: seed.projects ?? [],
          workplace: seed.workplace ?? null,
          school: seed.school ?? null,
        })

        await ctx.db.patch(existing._id, {
          name: seed.name,
          email: seed.email,
          dob: seed.dob,
          bio: seed.bio,
          location: seed.location,
          visibility: seed.visibility,
          currentStatus: seed.currentStatus,
          interests: seed.interests,
          media: seed.media,
          places: seed.places,
          projects: seed.projects,
          workplace: seed.workplace,
          school: seed.school,
        })
        if (embeddingInputBefore !== embeddingInputAfter) {
          await ctx.scheduler.runAfter(0, internal.embeddings.reindexUser, {
            userId: existing._id,
          })
        }
        updated++
        results.push({
          _id: existing._id,
          username: seed.username,
          name: seed.name,
        })
      } else {
        const userId = await ctx.db.insert("users", {
          name: seed.name,
          email: seed.email,
          username: seed.username,
          dob: seed.dob,
          bio: seed.bio,
          location: seed.location,
          visibility: seed.visibility,
          currentStatus: seed.currentStatus,
          interests: seed.interests,
          media: seed.media,
          places: seed.places,
          projects: seed.projects,
          workplace: seed.workplace,
          school: seed.school,
        })
        await ctx.scheduler.runAfter(0, internal.embeddings.reindexUser, {
          userId,
        })
        inserted++
        results.push({
          _id: userId,
          username: seed.username,
          name: seed.name,
        })
      }
    }

    return { inserted, updated, users: results }
  },
})
