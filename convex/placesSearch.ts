// Public-facing Google Places Text Search used by the profile "Add place from
// search" dialog. Wraps the shared helper in `lib/googlePlaces.ts`, auth-gates
// the call via `resolveIdentity`, and returns a serialisable payload the
// client can render as cards + auto-fill into the form.

import { v } from "convex/values";
import { action } from "./_generated/server";
import {
  buildMapsLinkFromPlaceId,
  extractCityFromAddressComponents,
  extractCountryFromAddressComponents,
  googlePlacesTextSearch,
  mapGoogleTypesToProfileType,
  type ProfilePlaceType,
} from "./lib/googlePlaces";
import { resolveIdentity } from "./lib/identity";

const placeTypeValidator = v.union(
  v.literal("restaurant"),
  v.literal("cafe"),
  v.literal("bar"),
  v.literal("park"),
  v.literal("gym"),
  v.literal("library"),
  v.literal("store"),
  v.literal("hangout"),
  v.literal("other"),
);

export const searchPlacesForProfile = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    query: v.string(),
    places: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        address: v.optional(v.string()),
        typeLabel: v.optional(v.string()),
        suggestedType: placeTypeValidator,
        rating: v.optional(v.number()),
        ratingCount: v.optional(v.number()),
        mapsLink: v.string(),
        imageUrl: v.optional(v.string()),
        location: v.optional(
          v.object({
            latitude: v.number(),
            longitude: v.number(),
          }),
        ),
      }),
    ),
    note: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { query, limit, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });

    const trimmed = query.trim();
    if (!trimmed) {
      return { query: trimmed, places: [] };
    }

    const result = await googlePlacesTextSearch(trimmed, {
      maxResultCount: Math.min(Math.max(limit ?? 8, 1), 10),
    });

    if (!result.ok) {
      if (result.reason === "missing_key") {
        return {
          query: trimmed,
          places: [],
          note:
            result.note ??
            "Google Places key not configured on this deployment.",
        };
      }
      return {
        query: trimmed,
        places: [],
        error: `Places search failed (HTTP ${result.status ?? "unknown"}).`,
      };
    }

    return {
      query: trimmed,
      places: result.places.map((p) => {
        // Prefer the provider's canonical `googleMapsUri`; fall back to the
        // deterministic `query_place_id` form so the saved link is always
        // clickable even if the provider omits the URL.
        const mapsLink =
          p.mapsLink ?? buildMapsLinkFromPlaceId(p.id, p.name);
        const suggestedType: ProfilePlaceType = mapGoogleTypesToProfileType(
          p.types,
        );
        return {
          id: p.id,
          name: p.name,
          address: p.address ?? undefined,
          typeLabel: p.typeLabel ?? undefined,
          suggestedType,
          rating: p.rating ?? undefined,
          ratingCount: p.ratingCount ?? undefined,
          mapsLink,
          imageUrl: p.imageUrl ?? undefined,
          location: p.location ?? undefined,
        };
      }),
    };
  },
});

// Location-oriented search used by the community create/edit flows. Same
// Google Places Text Search endpoint, but the returned shape drops the
// profile-specific `suggestedType` and adds structured `city` + `country`
// parsed out of `addressComponents`. Works for both places (e.g. "Prince
// Street Pizza") and administrative regions (e.g. "Bangalore", "Karnataka").
export const searchLocation = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    query: v.string(),
    places: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        address: v.optional(v.string()),
        typeLabel: v.optional(v.string()),
        types: v.array(v.string()),
        mapsLink: v.string(),
        city: v.optional(v.string()),
        country: v.optional(v.string()),
        location: v.optional(
          v.object({
            latitude: v.number(),
            longitude: v.number(),
          }),
        ),
      }),
    ),
    note: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { query, limit, devUserId }) => {
    await resolveIdentity(ctx, { devUserId });

    const trimmed = query.trim();
    if (!trimmed) {
      return { query: trimmed, places: [] };
    }

    const result = await googlePlacesTextSearch(trimmed, {
      maxResultCount: Math.min(Math.max(limit ?? 8, 1), 10),
    });

    if (!result.ok) {
      if (result.reason === "missing_key") {
        return {
          query: trimmed,
          places: [],
          note:
            result.note ??
            "Google Places key not configured on this deployment.",
        };
      }
      return {
        query: trimmed,
        places: [],
        error: `Places search failed (HTTP ${result.status ?? "unknown"}).`,
      };
    }

    return {
      query: trimmed,
      places: result.places.map((p) => {
        const mapsLink =
          p.mapsLink ?? buildMapsLinkFromPlaceId(p.id, p.name);
        const city = extractCityFromAddressComponents(p.addressComponents);
        const country = extractCountryFromAddressComponents(p.addressComponents);
        return {
          id: p.id,
          name: p.name,
          address: p.address ?? undefined,
          typeLabel: p.typeLabel ?? undefined,
          types: p.types,
          mapsLink,
          city: city ?? undefined,
          country: country ?? undefined,
          location: p.location ?? undefined,
        };
      }),
    };
  },
});
