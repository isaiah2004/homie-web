import { v } from "convex/values";
import { action } from "./_generated/server";

const JIKAN_API_BASE = "https://api.jikan.moe/v4";
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 100;

export type NormalizedJikanResult = {
  source: "jikan";
  kind: "anime";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
};

type JikanAnime = {
  mal_id: number;
  title: string;
  year: number | null;
  type: string | null;
  images?: { jpg?: { image_url?: string } };
};

type JikanSearchResponse = {
  data?: Array<JikanAnime | null>;
};

export const searchJikan = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const q = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [] as NormalizedJikanResult[];

    const clampedLimit = Math.min(
      Math.max(
        Math.floor(Number.isFinite(limit) ? (limit as number) : 10),
        1,
      ),
      25,
    );

    const url = new URL(`${JIKAN_API_BASE}/anime`);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(clampedLimit));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Jikan search failed", { status: res.status, body: text });
      if (res.status === 429) {
        throw new Error("Jikan rate limit hit, please retry shortly");
      }
      throw new Error("Anime search failed");
    }

    const data = (await res.json()) as JikanSearchResponse;
    const out: NormalizedJikanResult[] = [];
    for (const anime of data.data ?? []) {
      if (!anime) continue;
      const yearPart = anime.year ? String(anime.year) : "";
      const typePart = anime.type ?? "";
      const subtitle = [yearPart, typePart].filter(Boolean).join(" • ");
      const imageUrl = anime.images?.jpg?.image_url;
      out.push({
        source: "jikan",
        kind: "anime",
        id: String(anime.mal_id),
        title: anime.title,
        subtitle: subtitle || undefined,
        imageUrl: imageUrl || undefined,
      });
    }
    return out;
  },
});
