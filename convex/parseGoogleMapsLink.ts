"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

const PLACE_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "park",
  "gym",
  "library",
  "store",
  "hangout",
  "other",
] as const;

type PlaceType = (typeof PLACE_TYPES)[number];

export const parseGoogleMapsLink = action({
  args: { url: v.string() },
  returns: v.object({
    name: v.string(),
    address: v.optional(v.string()),
    type: v.union(
      v.literal("restaurant"),
      v.literal("cafe"),
      v.literal("bar"),
      v.literal("park"),
      v.literal("gym"),
      v.literal("library"),
      v.literal("store"),
      v.literal("hangout"),
      v.literal("other"),
    ),
    mapsLink: v.string(),
  }),
  handler: async (_ctx, { url }) => {
    let resolvedUrl = url.trim();

    // 1. Resolve shortened URLs by following redirects
    if (
      resolvedUrl.includes("goo.gl/") ||
      resolvedUrl.includes("maps.app.goo.gl")
    ) {
      const res = await fetch(resolvedUrl, { redirect: "follow" });
      resolvedUrl = res.url;
    }

    // 2. Validate it's a Google Maps URL
    if (
      !resolvedUrl.includes("google.com/maps") &&
      !resolvedUrl.includes("google.co") // regional domains like google.co.uk
    ) {
      throw new Error("Not a valid Google Maps link.");
    }

    // 3. Extract place name from URL path
    const parsed = new URL(resolvedUrl);
    const pathname = parsed.pathname;
    let name = "";

    // /maps/place/Place+Name/...
    const placeMatch = pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      name = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }

    // Fallback: ?q= param
    if (!name) {
      const qParam = parsed.searchParams.get("q");
      if (qParam) name = qParam;
    }

    if (!name) {
      throw new Error(
        "Could not extract a place name from this link. Make sure you're sharing a link to a specific place.",
      );
    }

    // 4. Try Google Places API for rich details
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      try {
        const result = await fetchPlaceDetails(name, apiKey);
        if (result) {
          return {
            name: result.displayName,
            address: result.formattedAddress,
            type: mapGoogleType(result.types),
            mapsLink: result.googleMapsUri ?? resolvedUrl,
          };
        }
      } catch {
        // Fall through to URL-only parsing
      }
    }

    // 5. Fallback: return what we parsed from the URL
    return {
      name,
      address: undefined,
      type: inferPlaceType(name),
      mapsLink: resolvedUrl,
    };
  },
});

// --- Google Places API (New) helpers ---

interface PlaceResult {
  displayName: string;
  formattedAddress: string;
  types: string[];
  googleMapsUri?: string;
}

async function fetchPlaceDetails(
  textQuery: string,
  apiKey: string,
): Promise<PlaceResult | null> {
  // Places API (New) — Text Search
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.types,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
      }),
    },
  );

  if (!res.ok) return null;

  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;

  return {
    displayName:
      typeof place.displayName === "object"
        ? place.displayName.text
        : place.displayName,
    formattedAddress: place.formattedAddress ?? "",
    types: place.types ?? [],
    googleMapsUri: place.googleMapsUri,
  };
}

// --- Type inference helpers ---

const GOOGLE_TYPE_MAP: Record<string, PlaceType> = {
  restaurant: "restaurant",
  food: "restaurant",
  meal_delivery: "restaurant",
  meal_takeaway: "restaurant",
  cafe: "cafe",
  coffee_shop: "cafe",
  bar: "bar",
  night_club: "bar",
  park: "park",
  campground: "park",
  amusement_park: "park",
  gym: "gym",
  library: "library",
  store: "store",
  shopping_mall: "store",
  supermarket: "store",
  clothing_store: "store",
  book_store: "store",
  convenience_store: "store",
};

function mapGoogleType(types: string[]): PlaceType {
  for (const t of types) {
    if (t in GOOGLE_TYPE_MAP) return GOOGLE_TYPE_MAP[t];
  }
  return "other";
}

function inferPlaceType(name: string): PlaceType {
  const lower = name.toLowerCase();
  const rules: Array<[RegExp, PlaceType]> = [
    [/\b(cafe|coffee|starbucks|dunkin|peet)\b/i, "cafe"],
    [
      /\b(restaurant|diner|bistro|grill|eatery|sushi|pizza|burger|taco|noodle|ramen|bbq|steakhouse)\b/i,
      "restaurant",
    ],
    [/\b(bar|pub|brewery|taproom|lounge|cocktail|tavern)\b/i, "bar"],
    [/\b(park|garden|trail|nature|reserve|botanical)\b/i, "park"],
    [/\b(gym|fitness|crossfit|yoga|pilates|sport)\b/i, "gym"],
    [/\b(library)\b/i, "library"],
    [/\b(store|shop|market|mall|outlet|boutique|depot)\b/i, "store"],
  ];
  for (const [pattern, type] of rules) {
    if (pattern.test(lower)) return type;
  }
  return "other";
}
