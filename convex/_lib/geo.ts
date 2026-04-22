// Geo helpers for community discovery.
//
// We bucket every community to a 0.1° lat/lng cell so discovery queries
// can use the `communities.by_geoBucket` index instead of a full table
// scan. 0.1° is ~11 km at the equator — close enough for the MVP's
// neighbourhood / city radius tiers. A radius search then scans the
// viewer's own bucket plus the 8 neighbour buckets (3x3 grid) and applies
// a precise haversine filter before returning.

// 0.1° bucket ~= 11 km at the equator — good enough for discovery.
export function geoBucket(lat: number, lng: number): string {
  const rlat = Math.round(lat * 10) / 10
  const rlng = Math.round(lng * 10) / 10
  return `${rlat},${rlng}`
}

// Returns this bucket + 8 neighbors so a radius query can scan a 3x3 grid.
export function neighborBuckets(bucket: string): string[] {
  const [lat, lng] = bucket.split(",").map(Number)
  const out: string[] = []
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const bLat = Math.round((lat + dLat * 0.1) * 10) / 10
      const bLng = Math.round((lng + dLng * 0.1) * 10) / 10
      out.push(`${bLat},${bLng}`)
    }
  }
  return out
}

// Great-circle distance in kilometres between two (lat, lng) points.
// Standard haversine formula — accurate enough for radius filtering;
// we don't care about the sub-metre precision a more exact formula
// would buy us.
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2)
  return 2 * R * Math.asin(Math.sqrt(h))
}
