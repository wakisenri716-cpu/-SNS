import { getRouteEstimate, haversineMeters, isGoogleMapsConfigured } from "./googleMaps";
import { ttlCache } from "../lib/ttlCache";

// Every post in a feed or map response carries a travel estimate, so without
// a cache each page load would make one Directions API call per post. Same
// endpoints (to ~10m) and the same quarter hour of departure share a result
// for half an hour.
const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000;
const routeCache = ttlCache<Awaited<ReturnType<typeof getRouteEstimate>>>(ROUTE_CACHE_TTL_MS, 5000);

function cachedRouteEstimate(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, departureAt: Date) {
  const key = [origin.lat, origin.lng, destination.lat, destination.lng].map((n) => n.toFixed(4)).join(",") +
    `@${Math.floor(departureAt.getTime() / (15 * 60 * 1000))}`;
  return routeCache.get(key, () => getRouteEstimate(origin, destination, departureAt));
}

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
  // ISO timestamps for when the trip starts/ends. departureAt echoes back
  // whatever the caller asked for (defaulting to "now" if omitted);
  // arrivalAt = departureAt + totalDurationMin. Neither reflects a real
  // train/bus timetable — see the module doc comment below.
  departureAt: string;
  arrivalAt: string;
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

// Mock assumptions for when both ends have coordinates: actual routes run
// roughly 1.4x the straight-line distance and walking is ~4.5km/h. Public
// transport gets faster with distance — local trains and buses for short
// trips, rapid/limited express for regional ones, shinkansen and limited
// express for long ones — so the average speed (including waits and
// changes) steps up: ~30km/h up to 40 km of route, ~55km/h up to 150 km,
// ~110km/h beyond. Still an estimate, always labelled 仮データ.
const ROUTE_DETOUR_FACTOR = 1.4;
const MOCK_WALK_KMH = 4.5;
const MOCK_WALK_ONLY_KM = 2;
const MOCK_SPEED_STEPS: [maxRouteKm: number, kmh: number][] = [
  [40, 30],
  [150, 55],
  [Infinity, 110],
];

function mockTransitMinutes(routeKm: number) {
  const kmh = MOCK_SPEED_STEPS.find(([max]) => routeKm <= max)![1];
  return Math.round((routeKm / kmh) * 60);
}

function getMockTransitSuggestion(
  originLabel: string,
  destinationLabel: string,
  destinationLat: number,
  destinationLng: number,
  departureAt: Date,
  originCoords: { lat: number; lng: number } | null
): TransitSuggestion {
  // With both coordinates known (e.g. between two しおり stops), base the mock
  // on the real straight-line distance, so two spots 30m apart don't get a
  // 50-minute leg. Still a mock: no real route, timetable, or fare lookup.
  if (originCoords) {
    const straightKm = haversineMeters(originCoords, { lat: destinationLat, lng: destinationLng }) / 1000;
    const routeKm = straightKm * ROUTE_DETOUR_FACTOR;
    const legs: TransitLeg[] =
      straightKm <= MOCK_WALK_ONLY_KM
        ? [
            {
              mode: "walk",
              description: `${destinationLabel}まで徒歩`,
              durationMin: Math.max(1, Math.round((routeKm / MOCK_WALK_KMH) * 60)),
            },
          ]
        : [
            { mode: "walk", description: `${originLabel}から最寄り駅・バス停まで徒歩`, durationMin: 10 },
            {
              mode: "train",
              description: `${destinationLabel}方面へ電車・バス`,
              durationMin: mockTransitMinutes(routeKm),
            },
          ];
    const totalDurationMin = legs.reduce((sum, l) => sum + l.durationMin, 0);
    return {
      originLabel,
      destinationLabel,
      destinationLat,
      destinationLng,
      totalDurationMin,
      legs,
      estimatedFareYen: straightKm <= MOCK_WALK_ONLY_KM ? 0 : estimateFareYen(routeKm * 1000, "drive"),
      departureAt: departureAt.toISOString(),
      arrivalAt: new Date(departureAt.getTime() + totalDurationMin * 60000).toISOString(),
      isMock: true,
    };
  }

  // No origin coordinates (e.g. a typed place name that couldn't be geocoded):
  // deterministic pseudo-duration derived from the origin+destination names so
  // repeated calls for the same pair return the same mock numbers.
  let seed = 0;
  for (const ch of originLabel + destinationLabel) seed = (seed * 31 + ch.charCodeAt(0)) % 97;
  const walkMin = 5 + (seed % 10);
  const trainMin = 20 + (seed % 40);
  const mockDistanceKm = 3 + (seed % 120);
  const totalDurationMin = walkMin + trainMin;

  return {
    originLabel,
    destinationLabel,
    destinationLat,
    destinationLng,
    totalDurationMin,
    legs: [
      { mode: "walk", description: `${originLabel}まで徒歩`, durationMin: walkMin },
      { mode: "train", description: `${destinationLabel}最寄り駅まで電車`, durationMin: trainMin },
    ],
    estimatedFareYen: estimateFareYen(mockDistanceKm * 1000, "drive"),
    departureAt: departureAt.toISOString(),
    arrivalAt: new Date(departureAt.getTime() + totalDurationMin * 60000).toISOString(),
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
 * on getRouteEstimate in googleMaps.ts. That means departureAt/arrivalAt are
 * always a computed estimate (departure + walk/drive duration), never a real
 * train/bus timetable entry — this app has no such data source (a
 * specialized API like 駅すぱあと/NAVITIME would be needed for that, see
 * README). For a future/now departureTime with driving mode, the duration
 * does reflect real predicted traffic conditions from Google, though.
 * The fare shown is always an estimate (see estimateFareYen), never a real
 * fetched fare. Falls back to a deterministic mock so the feature still works
 * without external credentials or an unrecognized origin. The `isMock` flag on
 * the result tells the frontend whether to show the "仮データ" (mock data) badge.
 */
export async function getTransitSuggestion(
  destinationLabel: string,
  destinationLat: number,
  destinationLng: number,
  origin?: { label: string; lat?: number; lng?: number } | null,
  departureAt: Date = new Date()
): Promise<TransitSuggestion> {
  if (isGoogleMapsConfigured() && origin && origin.lat != null && origin.lng != null) {
    try {
      const estimate = await cachedRouteEstimate(
        { lat: origin.lat, lng: origin.lng },
        { lat: destinationLat, lng: destinationLng },
        departureAt
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
          departureAt: departureAt.toISOString(),
          arrivalAt: new Date(departureAt.getTime() + estimate.totalDurationMin * 60000).toISOString(),
          isMock: false,
        };
      }
    } catch (err) {
      console.error("[maas] Directions API call failed, falling back to mock:", err);
    }
  }

  return getMockTransitSuggestion(
    origin?.label ?? "最寄り駅",
    destinationLabel,
    destinationLat,
    destinationLng,
    departureAt,
    origin && origin.lat != null && origin.lng != null ? { lat: origin.lat, lng: origin.lng } : null
  );
}
