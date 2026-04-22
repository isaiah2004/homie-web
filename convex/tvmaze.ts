import { v } from "convex/values";
import { action } from "./_generated/server";
import { resolveIdentity } from "./lib/identity";

// TVMaze public search API — no key, no rate limit headers worth respecting
// at our debounce cadence. Preferred over iTunes for TV series because
// Apple disabled media=tvShow filtering.
const TVMAZE_API_BASE = "https://api.tvmaze.com/search/shows";
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 100;

export type NormalizedTvMazeResult = {
  source: "tvmaze";
  kind: "series";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
};

type TvMazeShow = {
  id?: number;
  name?: string;
  premiered?: string | null;
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
  image?: { medium?: string; original?: string } | null;
};

type TvMazeSearchItem = {
  score?: number;
  show?: TvMazeShow | null;
};

export const searchTvMaze = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { query, limit, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });

    const q = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [] as NormalizedTvMazeResult[];

    const targetCount = Math.min(
      Math.max(
        Math.floor(Number.isFinite(limit) ? (limit as number) : 10),
        1,
      ),
      25,
    );

    const url = new URL(TVMAZE_API_BASE);
    url.searchParams.set("q", q);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("TVMaze search failed", {
        status: res.status,
        body: text,
      });
      if (res.status === 429) {
        throw new Error("TV search rate limit hit, please retry shortly");
      }
      throw new Error("TV search failed");
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];

    const out: NormalizedTvMazeResult[] = [];
    for (const entry of data as TvMazeSearchItem[]) {
      const show = entry?.show;
      if (!show || typeof show.id !== "number" || !show.name) continue;
      const year =
        typeof show.premiered === "string" && show.premiered.length >= 4
          ? show.premiered.slice(0, 4)
          : "";
      const channel = show.network?.name ?? show.webChannel?.name ?? "";
      const parts = [channel, year].filter(Boolean);
      const subtitle = parts.length ? parts.join(" • ") : undefined;
      const imageUrl =
        show.image?.original || show.image?.medium || undefined;
      out.push({
        source: "tvmaze",
        kind: "series",
        id: String(show.id),
        title: show.name,
        subtitle,
        imageUrl,
      });
      if (out.length >= targetCount) break;
    }
    return out;
  },
});
