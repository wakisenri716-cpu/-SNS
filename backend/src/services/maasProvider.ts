import { getTransitDirections, isGoogleMapsConfigured } from "./googleMaps";

export interface TransitLeg {
  mode: "walk" | "train" | "bus" | "other";
  description: string;
  durationMin: number;
}

export interface TransitSuggestion {
  originLabel: string;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  totalDurationMin: number;
  legs: TransitLeg[];
  isMock: boolean;
}

function getMockTransitSuggestion(
  originLabel: string,
  destinationLabel: string,
  destinationLat: number,
  destinationLng: number
): TransitSuggestion {
  // Deterministic pseudo-duration derived from the destination name so repeated
  // calls for the same place return the same mock numbers.
  let seed = 0;
  for (const ch of destinationLabel) seed = (seed * 31 + ch.charCodeAt(0)) % 97;
  const walkMin = 5 + (seed % 10);
  const trainMin = 20 + (seed % 40);

  return {
    originLabel,
    destinationLabel,
    destinationLat,
    destinationLng,
    totalDurationMin: walkMin + trainMin,
    legs: [
      { mode: "walk", description: `${originLabel}まで徒歩`, durationMin: walkMin },
      { mode: "train", description: `${destinationLabel}最寄り駅まで電車`, durationMin: trainMin },
    ],
    isMock: true,
  };
}

/**
 * MaaS (Mobility as a Service) transit suggestion for a reel's location.
 *
 * Uses the real Google Maps Directions API (transit mode) when
 * `GOOGLE_MAPS_API_KEY` is configured AND the municipality has set a geocoded
 * "nearest station" reference point (see Municipality.nearestStationLat/Lng).
 * Otherwise falls back to a deterministic mock so the feature still works without
 * external credentials. The `isMock` flag on the result tells the frontend whether
 * to show the "仮データ" (mock data) badge.
 */
export async function getTransitSuggestion(
  destinationLabel: string,
  destinationLat: number,
  destinationLng: number,
  origin?: { label: string; lat: number; lng: number } | null
): Promise<TransitSuggestion> {
  if (isGoogleMapsConfigured() && origin) {
    try {
      const directions = await getTransitDirections(
        { lat: origin.lat, lng: origin.lng },
        { lat: destinationLat, lng: destinationLng }
      );
      if (directions) {
        return {
          originLabel: origin.label,
          destinationLabel,
          destinationLat,
          destinationLng,
          totalDurationMin: directions.totalDurationMin,
          legs: directions.legs,
          isMock: false,
        };
      }
    } catch (err) {
      console.error("[maas] Directions API call failed, falling back to mock:", err);
    }
  }

  return getMockTransitSuggestion(origin?.label ?? "最寄り駅", destinationLabel, destinationLat, destinationLng);
}
