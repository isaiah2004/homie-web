"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  qdrantClient,
  ensureProfileItemsCollection,
  PROFILE_ITEMS_COLLECTION,
} from "../lib/qdrant";
import type { Doc, Id } from "./_generated/dataModel";

type EntityType = "place" | "media" | "project" | "interest";

type ProfileItemPayload = {
  userId: string;
  ownerName: string;
  ownerLocation?: string;
  entityType: EntityType;
  visibility: "close" | "friends" | "mutual" | "none";
  // Per-entity surface fields (denormalized so the agent tool can format
  // results without a second Convex round-trip).
  // place
  name?: string;
  placeType?: string;
  mapsLink?: string;
  address?: string;
  tags?: string[];
  // media
  title?: string;
  mediaType?: string;
  // project
  description?: string;
  // interest
  value?: string;
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on the Convex deployment");
  return createOpenAI({ apiKey });
}

function buildItemsForUser(user: Doc<"users">): Array<{
  text: string;
  payload: ProfileItemPayload;
}> {
  const out: Array<{ text: string; payload: ProfileItemPayload }> = [];
  const ownerName = user.name;
  const ownerLocation = user.location;
  const ownerBase = {
    userId: user._id,
    ownerName,
    ownerLocation,
  };

  for (const place of user.places ?? []) {
    const tagPart = place.tags.length ? `. ${place.tags.join(", ")}` : "";
    const addrPart = place.address ? `. ${place.address}` : "";
    out.push({
      text: `${place.name}. ${place.type}${addrPart}${tagPart}. recommended by ${ownerName}${ownerLocation ? " in " + ownerLocation : ""}`,
      payload: {
        ...ownerBase,
        entityType: "place",
        visibility: place.visibility,
        name: place.name,
        placeType: place.type,
        mapsLink: place.mapsLink,
        address: place.address,
        tags: place.tags,
      },
    });
  }

  for (const media of user.media ?? []) {
    out.push({
      text: `${media.title} (${media.type}). recommended by ${ownerName}`,
      payload: {
        ...ownerBase,
        entityType: "media",
        visibility: media.visibility,
        title: media.title,
        mediaType: media.type,
      },
    });
  }

  for (const project of user.projects ?? []) {
    const tagPart = project.tags.length ? `. ${project.tags.join(", ")}` : "";
    out.push({
      text: `${project.title}. ${project.description ?? ""}${tagPart}`.trim(),
      payload: {
        ...ownerBase,
        entityType: "project",
        visibility: project.visibility,
        title: project.title,
        description: project.description,
        tags: project.tags,
      },
    });
  }

  for (const interest of user.interests ?? []) {
    out.push({
      text: `${interest.value}. likes: ${ownerName}`,
      payload: {
        ...ownerBase,
        entityType: "interest",
        visibility: interest.visibility,
        value: interest.value,
      },
    });
  }

  return out;
}

// Full-rebuild a single user's points. Cheap at our scale (tens of items per
// user) and avoids needing stable per-item IDs since the underlying schema
// stores items as positional array entries that can be reordered.
export const reindexUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ count: number }> => {
    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getUserById,
      { userId },
    );
    if (!user) return { count: 0 };

    await ensureProfileItemsCollection();

    // Always wipe this user's points first so removed items disappear.
    await qdrantClient.delete(PROFILE_ITEMS_COLLECTION, {
      filter: { must: [{ key: "userId", match: { value: userId } }] },
      wait: true,
    });

    const items = buildItemsForUser(user);
    if (items.length === 0) return { count: 0 };

    const openai = getOpenAI();
    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: items.map((i) => i.text),
    });

    await qdrantClient.upsert(PROFILE_ITEMS_COLLECTION, {
      wait: true,
      points: items.map((item, i) => ({
        id: randomUUID(),
        vector: embeddings[i],
        payload: item.payload as unknown as Record<string, unknown>,
      })),
    });

    return { count: items.length };
  },
});

export type SearchHit = {
  score: number;
  ownerId: Id<"users">;
  ownerName: string;
  ownerLocation?: string;
  visibility: "close" | "friends" | "mutual" | "none";
  // entity-shaped fields (only ones relevant to entityType are populated)
  name?: string;
  placeType?: string;
  mapsLink?: string;
  address?: string;
  tags?: string[];
  title?: string;
  mediaType?: string;
  description?: string;
  value?: string;
};

const entityTypeValidator = v.union(
  v.literal("place"),
  v.literal("media"),
  v.literal("project"),
  v.literal("interest"),
);

const visibilityValidator = v.union(
  v.literal("close"),
  v.literal("friends"),
  v.literal("mutual"),
  v.literal("none"),
);

// Vector search scoped to a known set of owner IDs (the asker's friends),
// then post-filtered in TS by per-owner allowed visibility tags. Post-filter
// keeps the Qdrant query simple even when tier rules differ across friends.
export const searchProfileItems = internalAction({
  args: {
    entityType: entityTypeValidator,
    query: v.string(),
    ownerIds: v.array(v.id("users")),
    allowedVisibilityByOwner: v.array(
      v.object({
        ownerId: v.id("users"),
        allowed: v.array(visibilityValidator),
      }),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { entityType, query, ownerIds, allowedVisibilityByOwner, limit },
  ): Promise<SearchHit[]> => {
    if (ownerIds.length === 0) return [];

    await ensureProfileItemsCollection();

    const openai = getOpenAI();
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    const cap = limit ?? 8;
    const results = await qdrantClient.search(PROFILE_ITEMS_COLLECTION, {
      vector: embedding,
      limit: cap * 3,
      with_payload: true,
      filter: {
        must: [
          { key: "entityType", match: { value: entityType } },
          { key: "userId", match: { any: ownerIds } },
        ],
      },
    });

    const allowedByOwner = new Map<string, Set<string>>();
    for (const entry of allowedVisibilityByOwner) {
      allowedByOwner.set(entry.ownerId, new Set(entry.allowed));
    }

    const hits: SearchHit[] = [];
    for (const r of results) {
      const p = (r.payload ?? {}) as ProfileItemPayload;
      const allowed = allowedByOwner.get(p.userId);
      if (!allowed || !allowed.has(p.visibility)) continue;
      hits.push({
        score: r.score ?? 0,
        ownerId: p.userId as Id<"users">,
        ownerName: p.ownerName,
        ownerLocation: p.ownerLocation,
        visibility: p.visibility,
        name: p.name,
        placeType: p.placeType,
        mapsLink: p.mapsLink,
        address: p.address,
        tags: p.tags,
        title: p.title,
        mediaType: p.mediaType,
        description: p.description,
        value: p.value,
      });
      if (hits.length >= cap) break;
    }
    return hits;
  },
});
