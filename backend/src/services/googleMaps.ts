// Thin wrapper around the two Google Maps Platform APIs this app uses:
//   - Geocoding API: turn a free-text place name into lat/lng
//   - Directions API: get a real walk+transit route between two points
//
// Both require GOOGLE_MAPS_API_KEY to be set (a server-side-only key restricted to
// these two APIs — see README for setup instructions). When the key is missing,
// callers should fall back to the mock provider; this module never throws for a
// missing key, it just reports unavailable via isGoogleMapsConfigured().

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Bounds how long a single Google Maps call can block a request (e.g. posting a
// reel, or loading the feed). Without this, a slow/unresponsive upstream call
// would hang the whole request indefinitely instead of falling back to mock data.
const REQUEST_TIMEOUT_MS = 5000;

export function isGoogleMapsConfigured(): boolean {
  return Boolean(API_KEY);
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export async function geocode(query: string): Promise<GeocodeResult | null> {
  if (!API_KEY) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const data: any = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const WALKING_THRESHOLD_METERS = 3000;

export interface RouteEstimate {
  totalDurationMin: number;
  mode: "walk" | "drive";
}

// Real point-to-point travel time via Google Directions API.
//
// Note: Google's Directions/Routes API mode=transit reliably returns
// ZERO_RESULTS for Japan (transit schedule data there is not exposed through
// this API for third-party keys, unlike the US) — verified against several
// well-known Japanese station pairs. So instead of exact train/bus transit
// times, this estimates travel time using real walking directions for short
// distances and real driving directions otherwise, which Google does support
// in Japan. See README for details.
export async function getRouteEstimate(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteEstimate | null> {
  if (!API_KEY) return null;

  const mode = haversineMeters(origin, destination) <= WALKING_THRESHOLD_METERS ? "walking" : "driving";

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const data: any = await res.json();
  if (data.status !== "OK" || !data.routes?.[0]) return null;

  const durationSeconds = data.routes[0].legs[0]?.duration?.value ?? 0;
  return {
    totalDurationMin: Math.max(1, Math.round(durationSeconds / 60)),
    mode: mode === "walking" ? "walk" : "drive",
  };
}
