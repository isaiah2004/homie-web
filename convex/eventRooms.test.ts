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
    })
  })
}

async function seedEvent(
  t: ReturnType<typeof convexTest>,
  creatorId: Id<"users">,
  name = "Test Event",
): Promise<Id<"events">> {
  return await t.mutation(api.events.createEvent, {
    devUserId: creatorId,
    name,
    startsAt: Date.now() + 24 * 60 * 60 * 1000,
    visibility: "public",
  })
}

describe("eventRooms.joinEventRoom", () => {
  test("idempotent join with the same share token", async () => {
    const t = convexTest(schema, modules)
    const host = await seedUser(t, "host@test.dev", "Host")
    const guest = await seedUser(t, "guest@test.dev", "Guest")
    const eventId = await seedEvent(t, host)
    const { shareToken } = await t.mutation(
      api.eventRooms.generateShareLink,
      { devUserId: host, eventId },
    )

    const first = await t.mutation(api.eventRooms.joinEventRoom, {
      devUserId: guest,
      shareToken,
    })
    expect(first.alreadyMember).toBe(false)

    const second = await t.mutation(api.eventRooms.joinEventRoom, {
      devUserId: guest,
      shareToken,
    })
    expect(second.alreadyMember).toBe(true)

    // Member count must reflect host + guest = 2 (no double-count).
    const room = await t.query(api.eventRooms.getRoomForViewer, {
      devUserId: host,
      eventId,
    })
    expect(room?.memberCount).toBe(2)
  })

  test("revoked share token rejects new joiners but keeps members", async () => {
    const t = convexTest(schema, modules)
    const host = await seedUser(t, "host2@test.dev", "Host2")
    const guest = await seedUser(t, "guest2@test.dev", "Guest2")
    const eventId = await seedEvent(t, host)
    const { shareToken } = await t.mutation(
      api.eventRooms.generateShareLink,
      { devUserId: host, eventId },
    )
    await t.mutation(api.eventRooms.joinEventRoom, {
      devUserId: guest,
      shareToken,
    })
    await t.mutation(api.eventRooms.revokeShareLink, {
      devUserId: host,
      eventId,
    })

    const fresh = await seedUser(t, "fresh@test.dev", "Fresh")
    await expect(
      t.mutation(api.eventRooms.joinEventRoom, {
        devUserId: fresh,
        shareToken,
      }),
    ).rejects.toThrow(/Invalid invite link/)

    // Existing member still in.
    const guestRoom = await t.query(api.eventRooms.getRoomForViewer, {
      devUserId: guest,
      eventId,
    })
    expect(guestRoom?.isMember).toBe(true)
  })
})

describe("eventRooms.addFriendFromRoom", () => {
  test("requires both users in the same lobby", async () => {
    const t = convexTest(schema, modules)
    const host = await seedUser(t, "fr-host@test.dev", "Host")
    const inLobby = await seedUser(t, "fr-in@test.dev", "InLobby")
    const stranger = await seedUser(t, "fr-out@test.dev", "Stranger")
    const eventId = await seedEvent(t, host)
    const { shareToken } = await t.mutation(
      api.eventRooms.generateShareLink,
      { devUserId: host, eventId },
    )
    await t.mutation(api.eventRooms.joinEventRoom, {
      devUserId: inLobby,
      shareToken,
    })

    // host -> inLobby: both in lobby, allowed.
    const result = await t.mutation(api.eventRooms.addFriendFromRoom, {
      devUserId: host,
      eventId,
      targetUserId: inLobby,
    })
    expect(result.status).toBe("pending")

    // host -> stranger: stranger isn't in lobby, rejected.
    await expect(
      t.mutation(api.eventRooms.addFriendFromRoom, {
        devUserId: host,
        eventId,
        targetUserId: stranger,
      }),
    ).rejects.toThrow(/isn't in this lobby/)
  })
})

describe("eventRooms.leaveEventRoom", () => {
  test("host cannot leave", async () => {
    const t = convexTest(schema, modules)
    const host = await seedUser(t, "lh@test.dev", "Host")
    const eventId = await seedEvent(t, host)
    await expect(
      t.mutation(api.eventRooms.leaveEventRoom, {
        devUserId: host,
        eventId,
      }),
    ).rejects.toThrow(/host can't leave/i)
  })
})

describe("eventRooms.sendRoomMessage", () => {
  test("blocks send when room is disabled", async () => {
    const t = convexTest(schema, modules)
    const host = await seedUser(t, "send-host@test.dev", "Host")
    const eventId = await seedEvent(t, host)
    await t.mutation(api.events.cancelEvent, {
      devUserId: host,
      eventId,
    })
    await expect(
      t.mutation(api.eventRooms.sendRoomMessage, {
        devUserId: host,
        eventId,
        content: "hello",
        format: "plain",
      }),
    ).rejects.toThrow(/lobby is closed/i)
  })
})
