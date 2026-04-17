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

const ALLOWED_SHORT_HOSTS = new Set(["goo.gl", "maps.app.goo.gl"]);

function isGoogleMapsHost(hostname: string): boolean {
  return (
    hostname === "www.google.com" ||
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    /^(www\.)?google\.co(\.\w+)?$/.test(hostname)
  );
}

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
  handler: async (ctx, { url }) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required.");

    let resolvedUrl = url.trim();

    // Validate URL format
    let urlObj: URL;
    try {
      urlObj = new URL(resolvedUrl);
    } catch {
      throw new Error("The provided text is not a valid URL.");
    }

    // 1. Resolve shortened URLs — only allow known Google short domains
    if (ALLOWED_SHORT_HOSTS.has(urlObj.hostname)) {
      const res = await fetch(resolvedUrl, { redirect: "follow" });
      resolvedUrl = res.url;
      try {
        urlObj = new URL(resolvedUrl);
      } catch {
        throw new Error("Failed to resolve shortened URL.");
      }
      // Verify redirect landed on a Google domain
      if (!isGoogleMapsHost(urlObj.hostname)) {
        throw new Error("Shortened link did not resolve to Google Maps.");
      }
    }

    // 2. Validate it's a Google Maps URL
    if (!isGoogleMapsHost(urlObj.hostname) || !urlObj.pathname.startsWith("/maps")) {
      throw new Error("Not a valid Google Maps link.");
    }

    // 3. Extract place name from URL path
    const pathname = urlObj.pathname;
    let name = "";

    // /maps/place/Place+Name/...
    const placeMatch = pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      name = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }

    // /maps/search/Search+Query/...
    if (!name) {
      const searchMatch = pathname.match(/\/maps\/search\/([^/@]+)/);
      if (searchMatch) {
        name = decodeURIComponent(searchMatch[1].replace(/\+/g, " "));
      }
    }

    // Fallback: ?q= param
    if (!name) {
      const qParam = urlObj.searchParams.get("q");
      if (qParam) name = qParam;
    }

    if (!name) {
      throw new Error(
        "Could not extract a place name from this link. Make sure you're sharing a link to a specific place.",
      );
    }

    // Extract coordinates for location-biased search
    const coordMatch = resolvedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

    // 4. Try Google Places API for rich details
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      try {
        const result = await fetchPlaceDetails(name, apiKey, coordMatch);
        if (result) {
          return {
            name: result.displayName,
            address: result.formattedAddress || undefined,
            type: mapGoogleType(result.types),
            mapsLink: result.googleMapsUri ?? resolvedUrl,
          };
        }
      } catch (err) {
        console.warn("Google Places API call failed, falling back to URL parsing:", err);
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
  coordMatch: RegExpMatchArray | null,
): Promise<PlaceResult | null> {
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 1,
  };

  // Add location bias from URL coordinates for more accurate results
  if (coordMatch) {
    body.locationBias = {
      circle: {
        center: {
          latitude: parseFloat(coordMatch[1]),
          longitude: parseFloat(coordMatch[2]),
        },
        radius: 500.0,
      },
    };
  }

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
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) return null;

  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;

  return {
    displayName:
      place.displayName && typeof place.displayName === "object"
        ? place.displayName.text
        : (place.displayName ?? ""),
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
    [/\b(cafe|coffee|starbucks|dunkin|peet)\b/, "cafe"],
    [
      /\b(restaurant|diner|bistro|grill|eatery|sushi|pizza|burger|taco|noodle|ramen|bbq|steakhouse)\b/,
      "restaurant",
    ],
    [/\b(bar|pub|brewery|taproom|lounge|cocktail|tavern)\b/, "bar"],
    [/\b(park|garden|trail|nature|reserve|botanical)\b/, "park"],
    [/\b(gym|fitness|crossfit|yoga|pilates|sport)\b/, "gym"],
    [/\b(library)\b/, "library"],
    [/\b(store|shop|market|mall|outlet|boutique|depot)\b/, "store"],
  ];
  for (const [pattern, type] of rules) {
    if (pattern.test(lower)) return type;
  }
  return "other";
}
