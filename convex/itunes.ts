import { v } from "convex/values";
import { action } from "./_generated/server";

// iTunes Search API: Apple disabled the `media=movie` and `media=tvShow`
// filters (they now return resultCount=0). General search still surfaces
// feature films under kind="feature-movie", so we drop the filter and
// narrow on the client side. TV series are handled by TVMaze instead.
const ITUNES_API_BASE = "https://itunes.apple.com/search";
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 100;

export type NormalizedItunesResult = {
  source: "itunes";
  kind: "movie";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
};

type ItunesResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  kind?: string;
};

type ItunesSearchResponse = {
  resultCount?: number;
  results?: Array<ItunesResult | null>;
};

export const searchItunes = action({
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
    if (!q) return [] as NormalizedItunesResult[];

    const targetCount = Math.min(
      Math.max(
        Math.floor(Number.isFinite(limit) ? (limit as number) : 10),
        1,
      ),
      25,
    );
    // Over-fetch because we client-filter — many general-search hits are
    // audiobooks / ebooks / music we'll drop.
    const fetchLimit = Math.min(targetCount * 5, 50);

    const url = new URL(ITUNES_API_BASE);
    url.searchParams.set("term", q);
    url.searchParams.set("limit", String(fetchLimit));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("iTunes search failed", { status: res.status, body: text });
      throw new Error("Movie search failed");
    }

    const data = (await res.json()) as ItunesSearchResponse;
    const out: NormalizedItunesResult[] = [];
    for (const item of data.results ?? []) {
      if (!item || item.kind !== "feature-movie") continue;
      if (typeof item.trackId !== "number" || !item.trackName) continue;
      const parts: string[] = [];
      if (item.artistName) parts.push(item.artistName);
      if (item.releaseDate) parts.push(item.releaseDate.slice(0, 4));
      const subtitle = parts.length ? parts.join(" • ") : undefined;
      const imageUrl = item.artworkUrl100
        ? item.artworkUrl100.replace("100x100bb", "600x600bb")
        : undefined;
      out.push({
        source: "itunes",
        kind: "movie",
        id: String(item.trackId),
        title: item.trackName,
        subtitle,
        imageUrl,
      });
      if (out.length >= targetCount) break;
    }
    return out;
  },
});
