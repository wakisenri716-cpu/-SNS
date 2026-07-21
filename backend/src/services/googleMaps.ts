// Thin wrapper around the two Google Maps Platform APIs this app uses:
//   - Geocoding API: turn a free-text place name into lat/lng
//   - Directions API: get a real walk+transit route between two points
//
// Both require GOOGLE_MAPS_API_KEY to be set (a server-side-only key restricted to
// these two APIs — see README for setup instructions). When the key is missing,
// callers should fall back to the mock provider; this module never throws for a
// missing key, it just reports unavailable via isGoogleMapsConfigured().

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

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

  const res = await fetch(url);
  const data: any = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}

export interface TransitLeg {
  mode: "walk" | "train" | "bus" | "other";
  description: string;
  durationMin: number;
}

export interface DirectionsResult {
  totalDurationMin: number;
  legs: TransitLeg[];
}

function mapTravelMode(googleMode: string): TransitLeg["mode"] {
  if (googleMode === "WALKING") return "walk";
  if (googleMode === "TRANSIT") return "train";
  if (googleMode === "BUS") return "bus";
  return "other";
}

// Real transit directions between two coordinates via Google Directions API
// (mode=transit, which itself includes the walking legs to/from stations).
export async function getTransitDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DirectionsResult | null> {
  if (!API_KEY) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "transit");
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url);
  const data: any = await res.json();
  if (data.status !== "OK" || !data.routes?.[0]) return null;

  const route = data.routes[0];
  const googleLegs = route.legs[0]?.steps ?? [];
  const totalDurationSeconds = route.legs[0]?.duration?.value ?? 0;

  const legs: TransitLeg[] = googleLegs.map((step: any) => {
    const mode = mapTravelMode(step.travel_mode);
    const line = step.transit_details?.line?.name;
    const vehicle = step.transit_details?.line?.vehicle?.name;
    return {
      mode,
      description:
        mode === "walk"
          ? "徒歩で移動"
          : `${vehicle ?? ""}${line ? ` ${line}` : ""}${mode === "train" || mode === "bus" ? "で移動" : ""}`.trim(),
      durationMin: Math.round((step.duration?.value ?? 0) / 60),
    };
  });

  return {
    totalDurationMin: Math.round(totalDurationSeconds / 60),
    legs,
  };
}
