import { geocode, isGoogleMapsConfigured } from "../services/googleMaps";

// Looks up a 観光情報 spot's coordinates from its name, qualified with the
// municipality name so a common name ("河童橋") resolves within the right
// area. Null when Maps isn't configured or the lookup fails — the spot is
// then simply saved without a location, never with a guessed one.
export async function locateTourismSpot(
  spotName: string,
  municipalityName: string
): Promise<{ locationLat: number; locationLng: number } | null> {
  if (!isGoogleMapsConfigured()) return null;
  try {
    const result = await geocode(`${spotName} ${municipalityName}`);
    return result ? { locationLat: result.lat, locationLng: result.lng } : null;
  } catch (err) {
    console.error("[tourismSpot] Geocoding failed, saving without location:", err);
    return null;
  }
}
