import { v } from "convex/values";
import { action } from "./_generated/server";
import { resolveIdentity } from "./lib/identity";

const CHEAPSHARK_API_BASE = "https://www.cheapshark.com/api/1.0/games";
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 100;
const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 60;

export type NormalizedCheapSharkResult = {
  source: "cheapshark";
  kind: "game";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
};

type SharkGame = {
  gameID?: string;
  steamAppID?: string | null;
  cheapest?: string;
  cheapestDealID?: string;
  external?: string;
  internalName?: string;
  thumb?: string;
};

function normalize(games: Array<SharkGame | null | undefined>): NormalizedCheapSharkResult[] {
  const out: NormalizedCheapSharkResult[] = [];
  for (const game of games) {
    if (!game) continue;
    const id = game.gameID;
    const title = game.external;
    if (!id || !title) continue;
    out.push({
      source: "cheapshark",
      kind: "game",
      id,
      title,
      subtitle: "PC",
      imageUrl: game.thumb || undefined,
    });
  }
  return out;
}

export const searchCheapShark = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { query, limit, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });

    const q = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [] as NormalizedCheapSharkResult[];

    const clampedLimit = Math.min(
      Math.max(
        Math.floor(Number.isFinite(limit) ? (limit as number) : DEFAULT_LIMIT),
        MIN_LIMIT,
      ),
      MAX_LIMIT,
    );

    const url = new URL(CHEAPSHARK_API_BASE);
    url.searchParams.set("title", q);
    url.searchParams.set("limit", String(clampedLimit));
    url.searchParams.set("exact", "0");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("CheapShark search failed", { status: res.status, body: text });
      throw new Error("Game search failed");
    }
    const data = (await res.json()) as Array<SharkGame | null | undefined>;
    if (!Array.isArray(data)) {
      return [] as NormalizedCheapSharkResult[];
    }
    return normalize(data);
  },
});
