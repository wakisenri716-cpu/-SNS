import { getRouteEstimate, isGoogleMapsConfigured } from "./googleMaps";

export interface TransitLeg {
  mode: "walk" | "train" | "bus" | "drive";
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
  // Rough fare estimate in yen. Not fetched from any real fare table (see the
  // note on estimateFareYen below) — always treat alongside isMock as "a
  // ballpark, not a quote".
  estimatedFareYen: number;
  isMock: boolean;
}

// Very rough public-transport-fare-style estimate, loosely modeled on typical
// Japanese regional rail fare bands (short trips ~¥20/km, long trips discount
// to ~¥12/km, plus a flat base fare) — NOT tied to any real operator's actual
// fare table. Real fares depend on the specific line/operator/route, which
// requires a specialized transit API (e.g. 駅すぱあと, NAVITIME) that this app
// doesn't integrate (see README). Walking has no fare.
function estimateFareYen(distanceMeters: number, mode: "walk" | "drive"): number {
  if (mode === "walk") return 0;
  const distanceKm = distanceMeters / 1000;
  const perKm = distanceKm > 100 ? 12 : distanceKm > 30 ? 16 : 20;
  const raw = 150 + distanceKm * perKm;
  return Math.round(raw / 10) * 10;
}

function getMockTransitSuggestion(
  originLabel: string,
  destinationLabel: string,
  destinationLat: number,
  destinationLng: number
): TransitSuggestion {
  // Deterministic pseudo-duration derived from the origin+destination names so
  // repeated calls for the same pair return the same mock numbers.
  let seed = 0;
  for (const ch of originLabel + destinationLabel) seed = (seed * 31 + ch.charCodeAt(0)) % 97;
  const walkMin = 5 + (seed % 10);
  const trainMin = 20 + (seed % 40);
  const mockDistanceKm = 3 + (seed % 120);

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
    estimatedFareYen: estimateFareYen(mockDistanceKm * 1000, "drive"),
    isMock: true,
  };
}

/**
 * MaaS (Mobility as a Service) transit suggestion between an origin and a
 * reel's (or municipality's) location.
 *
 * Uses the real Google Maps Directions API when `GOOGLE_MAPS_API_KEY` is
 * configured AND the origin has known coordinates (geocoded beforehand — see
 * GET /api/municipalities/:id/access-plan for the case where a viewer types in
 * their own starting point). Google's transit (train/bus schedule) mode does
 * not cover Japan for third-party API keys, so the real-data path estimates
 * travel time from real walking/driving directions instead — see the comment
 * on getRouteEstimate in googleMaps.ts. The fare shown is always an estimate
 * (see estimateFareYen), never a real fetched fare.
 * Otherwise falls back to a deterministic mock so the feature still works
 * without external credentials or an unrecognized origin. The `isMock` flag on
 * the result tells the frontend whether to show the "仮データ" (mock data) badge.
 */
export async function getTransitSuggestion(
  destinationLabel: string,
  destinationLat: number,
  destinationLng: number,
  origin?: { label: string; lat?: number; lng?: number } | null
): Promise<TransitSuggestion> {
  if (isGoogleMapsConfigured() && origin && origin.lat != null && origin.lng != null) {
    try {
      const estimate = await getRouteEstimate(
        { lat: origin.lat, lng: origin.lng },
        { lat: destinationLat, lng: destinationLng }
      );
      if (estimate) {
        return {
          originLabel: origin.label,
          destinationLabel,
          destinationLat,
          destinationLng,
          totalDurationMin: estimate.totalDurationMin,
          legs: [
            {
              mode: estimate.mode,
              description:
                estimate.mode === "walk" ? `${origin.label}から徒歩で移動` : `${origin.label}から車で移動`,
              durationMin: estimate.totalDurationMin,
            },
          ],
          estimatedFareYen: estimateFareYen(estimate.distanceMeters, estimate.mode),
          isMock: false,
        };
      }
    } catch (err) {
      console.error("[maas] Directions API call failed, falling back to mock:", err);
    }
  }

  return getMockTransitSuggestion(origin?.label ?? "最寄り駅", destinationLabel, destinationLat, destinationLng);
}
