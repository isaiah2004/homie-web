// Shared Google Places Text Search helpers.
//
// Both the AI chat tool (`agentTools.ts::searchPlaces`) and the profile-side
// search action (`placesSearch.ts::searchPlacesForProfile`) call into the
// same v1 Text Search endpoint, so the fetch lives here to avoid drift.
//
// No `"use node";` — this module only uses `fetch`, which is available in
// the default Convex runtime.

export type GooglePlaceResult = {
  id: string;
  name: string;
  address: string | null;
  typeLabel: string | null;
  types: string[];
  rating: number | null;
  ratingCount: number | null;
  mapsLink: string | null;
  imageUrl: string | null;
  location: { latitude: number; longitude: number } | null;
};

export type GooglePlacesSearchResponse =
  | { ok: true; places: GooglePlaceResult[] }
  | { ok: false; reason: "missing_key" | "http_error"; status?: number; note?: string };

type RawPlace = {
  id?: string;
  displayName?: { text?: string } | string;
  formattedAddress?: string;
  types?: string[];
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  photos?: Array<{ name?: string }>;
  primaryTypeDisplayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
};

type PlacesResponseBody = {
  places?: RawPlace[];
};

// Default field mask — includes everything both surfaces care about.
const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.photos",
  "places.location",
].join(",");

export async function googlePlacesTextSearch(
  query: string,
  options?: { maxResultCount?: number; apiKey?: string },
): Promise<GooglePlacesSearchResponse> {
  const apiKey = options?.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "missing_key",
      note: "Google Places key not configured",
    };
  }

  const maxResultCount = options?.maxResultCount ?? 8;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DEFAULT_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount }),
  });

  if (!res.ok) {
    return { ok: false, reason: "http_error", status: res.status };
  }

  const data = (await res.json()) as PlacesResponseBody;
  const places: GooglePlaceResult[] = (data.places ?? []).map((p) => {
    const name =
      p.displayName && typeof p.displayName === "object"
        ? (p.displayName.text ?? "")
        : ((p.displayName as string | undefined) ?? "");
    const typeLabel = p.primaryTypeDisplayName?.text ?? p.types?.[0] ?? null;
    const photo = p.photos?.[0]?.name ?? null;
    const imageUrl = photo
      ? `https://places.googleapis.com/v1/${photo}/media?key=${apiKey}&maxHeightPx=400`
      : null;
    const location =
      p.location &&
      typeof p.location.latitude === "number" &&
      typeof p.location.longitude === "number"
        ? { latitude: p.location.latitude, longitude: p.location.longitude }
        : null;
    return {
      id: p.id ?? name,
      name,
      address: p.formattedAddress ?? null,
      typeLabel,
      types: p.types ?? [],
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
      mapsLink: p.googleMapsUri ?? null,
      imageUrl,
      location,
    };
  });

  return { ok: true, places };
}

// Maps a Google "primary type" or `types[]` entry to the profile's place-type
// enum. Mirrors the logic in `parseGoogleMapsLink.ts` so both flows land on
// the same bucket for the same place.
const GOOGLE_TYPE_MAP: Record<string, ProfilePlaceType> = {
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

export type ProfilePlaceType =
  | "restaurant"
  | "cafe"
  | "bar"
  | "park"
  | "gym"
  | "library"
  | "store"
  | "hangout"
  | "other";

export function mapGoogleTypesToProfileType(
  types: string[] | null | undefined,
): ProfilePlaceType {
  for (const t of types ?? []) {
    if (t in GOOGLE_TYPE_MAP) return GOOGLE_TYPE_MAP[t];
  }
  return "other";
}

// Build a stable Google Maps URL from a Google Places "id" (`places/ChIJ...`
// or bare `ChIJ...`) and a display name, used when the provider doesn't return
// `googleMapsUri` (or when we want to normalise to the `query_place_id` form).
export function buildMapsLinkFromPlaceId(
  placeId: string,
  displayName: string,
): string {
  const stripped = placeId.startsWith("places/")
    ? placeId.slice("places/".length)
    : placeId;
  const query = encodeURIComponent(displayName || stripped);
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${stripped}`;
}
