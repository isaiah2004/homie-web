/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, test } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

async function seedUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  name: string,
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name,
      email,
      dob: "1995-01-01",
      visibility: "friends",
      eventInterests: [
        { value: "climbing", custom: false, visibility: "friends" },
      ],
    })
  })
}

async function seedEventWithLobby(
  t: ReturnType<typeof convexTest>,
  hostId: Id<"users">,
  guestIds: Id<"users">[],
): Promise<Id<"events">> {
  const eventId = await t.mutation(api.events.createEvent, {
    devUserId: hostId,
    name: "Match Test",
    startsAt: Date.now() + 86_400_000,
    visibility: "public",
  })
  const { shareToken } = await t.mutation(
    api.eventRooms.generateShareLink,
    { devUserId: hostId, eventId },
  )
  for (const guest of guestIds) {
    await t.mutation(api.eventRooms.joinEventRoom, {
      devUserId: guest,
      shareToken,
    })
  }
  return eventId
}

describe("eventMatch — pool exclusion", () => {
  test("excludes existing accepted friends and the viewer themselves", async () => {
    const t = convexTest(schema, modules)

    const viewer = await seedUser(t, "viewer@test.dev", "Viewer")
    const friend = await seedUser(t, "friend@test.dev", "Friend")
    const stranger = await seedUser(t, "stranger@test.dev", "Stranger")

    // Make `viewer` and `friend` accepted friends.
    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.insert("friends", {
        userId: viewer,
        friendId: friend,
        status: "accepted",
        tier: "friend",
        requestedBy: viewer,
        addedAt: now,
      })
      await ctx.db.insert("friends", {
        userId: friend,
        friendId: viewer,
        status: "accepted",
        tier: "friend",
        requestedBy: viewer,
        addedAt: now,
      })
    })

    const eventId = await seedEventWithLobby(t, viewer, [friend, stranger])
    await t.action(api.eventMatch.computeInitialMatches, {
      devUserId: viewer,
      eventId,
    })
    const state = await t.query(api.eventRooms.getMatchState, {
      devUserId: viewer,
      eventId,
    })
    expect(state).not.toBeNull()
    const ids = state!.matches.map((m) => m.userId as string)
    // Viewer themselves is excluded; existing accepted friend is excluded.
    expect(ids).not.toContain(viewer as string)
    expect(ids).not.toContain(friend as string)
    expect(ids).toContain(stranger as string)
  })
})

describe("eventMatch — reroll cap", () => {
  test("rerolls cap at 3 and exclude prior shown users", async () => {
    const t = convexTest(schema, modules)

    const viewer = await seedUser(t, "rv@test.dev", "RViewer")
    const guests: Id<"users">[] = []
    for (let i = 0; i < 5; i++) {
      guests.push(await seedUser(t, `g${i}@test.dev`, `Guest ${i}`))
    }
    const eventId = await seedEventWithLobby(t, viewer, guests)

    await t.action(api.eventMatch.computeInitialMatches, {
      devUserId: viewer,
      eventId,
    })
    const initial = await t.query(api.eventRooms.getMatchState, {
      devUserId: viewer,
      eventId,
    })
    expect(initial!.rerollsRemaining).toBe(3)
    const initialIds = new Set(initial!.matches.map((m) => m.userId as string))

    // First reroll — every match should be a NEW userId.
    await t.action(api.eventMatch.rerollMatches, {
      devUserId: viewer,
      eventId,
    })
    const after1 = await t.query(api.eventRooms.getMatchState, {
      devUserId: viewer,
      eventId,
    })
    for (const m of after1!.matches) {
      expect(initialIds.has(m.userId as string)).toBe(false)
    }
    expect(after1!.rerollsRemaining).toBe(2)

    // Burn through remaining 2 rerolls.
    await t.action(api.eventMatch.rerollMatches, {
      devUserId: viewer,
      eventId,
    })
    await t.action(api.eventMatch.rerollMatches, {
      devUserId: viewer,
      eventId,
    })
    const after3 = await t.query(api.eventRooms.getMatchState, {
      devUserId: viewer,
      eventId,
    })
    expect(after3!.rerollsRemaining).toBe(0)

    // Fourth reroll must throw.
    await expect(
      t.action(api.eventMatch.rerollMatches, {
        devUserId: viewer,
        eventId,
      }),
    ).rejects.toThrow(/No rerolls remaining/i)
  })
})

describe("eventMatch — score determinism", () => {
  test("two consecutive computes (with state cleared) yield identical scores", async () => {
    const t = convexTest(schema, modules)
    const viewer = await seedUser(t, "det-v@test.dev", "DetViewer")
    const a = await seedUser(t, "det-a@test.dev", "DetA")
    const b = await seedUser(t, "det-b@test.dev", "DetB")
    const eventId = await seedEventWithLobby(t, viewer, [a, b])

    await t.action(api.eventMatch.computeInitialMatches, {
      devUserId: viewer,
      eventId,
    })
    const first = await t.query(api.eventRooms.getMatchState, {
      devUserId: viewer,
      eventId,
    })

    // Wipe state, recompute. Same inputs → same scores + ordering.
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("eventMatchState")
        .collect()
      for (const r of rows) await ctx.db.delete(r._id)
    })
    await t.action(api.eventMatch.computeInitialMatches, {
      devUserId: viewer,
      eventId,
    })
    const second = await t.query(api.eventRooms.getMatchState, {
      devUserId: viewer,
      eventId,
    })
    expect(second!.matches.map((m) => m.userId)).toEqual(
      first!.matches.map((m) => m.userId),
    )
    for (let i = 0; i < first!.matches.length; i++) {
      expect(second!.matches[i].score).toBe(first!.matches[i].score)
    }
  })
})
