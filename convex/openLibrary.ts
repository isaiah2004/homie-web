import { v } from "convex/values";
import { action } from "./_generated/server";
import { resolveIdentity } from "./lib/identity";

const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 100;

export type NormalizedOpenLibraryResult = {
  source: "openlibrary";
  kind: "book";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
};

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

type OpenLibrarySearchResponse = {
  numFound?: number;
  docs?: Array<OpenLibraryDoc | null>;
};

function buildSubtitle(doc: OpenLibraryDoc): string | undefined {
  const parts: string[] = [];
  if (doc.author_name && doc.author_name[0]) {
    parts.push(`by ${doc.author_name[0]}`);
  }
  if (doc.first_publish_year) {
    parts.push(String(doc.first_publish_year));
  }
  return parts.length > 0 ? parts.join(" • ") : undefined;
}

function normalize(
  data: OpenLibrarySearchResponse,
): NormalizedOpenLibraryResult[] {
  const out: NormalizedOpenLibraryResult[] = [];
  for (const doc of data.docs ?? []) {
    if (!doc) continue;
    if (!doc.key || !doc.title) continue;
    const imageUrl =
      typeof doc.cover_i === "number"
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : undefined;
    out.push({
      source: "openlibrary",
      kind: "book",
      id: doc.key,
      title: doc.title,
      subtitle: buildSubtitle(doc),
      imageUrl,
    });
  }
  return out;
}

export const searchOpenLibrary = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { query, limit, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });

    const q = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return [] as NormalizedOpenLibraryResult[];

    const clampedLimit = Math.min(
      Math.max(
        Math.floor(Number.isFinite(limit) ? (limit as number) : 10),
        1,
      ),
      25,
    );

    const url = new URL(OPEN_LIBRARY_SEARCH_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(clampedLimit));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Open Library search failed", {
        status: res.status,
        body: text,
      });
      throw new Error("Book search failed");
    }
    const data = (await res.json()) as OpenLibrarySearchResponse;
    return normalize(data);
  },
});
