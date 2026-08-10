// Client-side "compare 5 ways to get there" estimator for ReelAccessPage.
//
// The backend can only ever hand back ONE real number per request — a real
// Google-routed walk/drive duration (see maasProvider.ts), or a deterministic
// mock walk+train estimate when Maps isn't configured/geocodable. There is no
// real bus/taxi schedule or fare data behind this app (see the note on
// estimateFareYen in maasProvider.ts). So to show train/bus/car/taxi/walk
// side by side, the other rows are derived client-side from the same
// origin+destination seed the backend's mock uses — same formula, so numbers
// stay consistent with what the app shows elsewhere — and every derived row
// is clearly marked as an estimate. Only the row that matches what the API
// actually returned (when it returned real data) gets the "real data" badge;
// everything else always reads as an estimate, never as live status.
import type { TransitSuggestion } from "../types";

export type AccessMode = "train" | "bus" | "car" | "taxi" | "walk";
export type GroupSize = "solo" | "couple" | "family";

export interface ModeEstimate {
  mode: AccessMode;
  durationMin: number;
  fareYen: number;
  isReal: boolean;
}

// Same hash as backend/src/services/maasProvider.ts's getMockTransitSuggestion
// — kept in sync deliberately so the numbers this page shows for a given
// origin+destination match what the backend's own mock fallback would say.
function seedOf(a: string, b: string): number {
  let seed = 0;
  const str = a + b;
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) % 97;
  return seed;
}

function tieredFare(distanceKm: number, base: number, near: number, mid: number, far: number): number {
  const perKm = distanceKm > 100 ? far : distanceKm > 30 ? mid : near;
  return Math.round((base + distanceKm * perKm) / 10) * 10;
}

// Walking is only shown as an option below this distance — nobody walks 60km,
// and the linear estimate below would otherwise produce an absurd number.
const WALK_DISTANCE_LIMIT_KM = 8;

/**
 * Derives all 5 mode rows from an origin/destination pair, upgrading
 * whichever row matches the real API result (if any) to use its real
 * duration/fare instead of the estimate.
 */
export function deriveModeEstimates(
  origin: string,
  destinationLabel: string,
  real: TransitSuggestion | null
): ModeEstimate[] {
  const seed = seedOf(origin, destinationLabel);
  const walkToStationMin = 5 + (seed % 10);
  const trainRideMin = 20 + (seed % 40);
  const seedDistanceKm = 3 + (seed % 120);

  // Every row is derived from one shared distance, so the 5 estimates stay
  // coherent relative to each other (a "20 min walk" next to a "90 min taxi"
  // for the same trip would be nonsense). The API doesn't expose raw
  // distance to the frontend, so when a real result came back this backs one
  // out from its duration (assuming a rough average speed for that mode);
  // otherwise it falls back to the same seeded distance the backend's own
  // mock fallback used to produce its fare, so the two stay consistent.
  let distanceKm = seedDistanceKm;
  if (real && !real.isMock) {
    const assumedKmh = real.legs[0]?.mode === "drive" ? 40 : 4.5;
    distanceKm = Math.max(0.5, (real.totalDurationMin / 60) * assumedKmh);
  }

  const carDurationMin = Math.max(5, Math.round((distanceKm / 40) * 60));
  const rows: ModeEstimate[] = [
    { mode: "train", durationMin: walkToStationMin + trainRideMin, fareYen: tieredFare(distanceKm, 140, 18, 14, 10), isReal: false },
    { mode: "bus", durationMin: walkToStationMin + Math.round(trainRideMin * 1.35) + 5, fareYen: tieredFare(distanceKm, 180, 10, 8, 6), isReal: false },
    { mode: "car", durationMin: carDurationMin, fareYen: tieredFare(distanceKm, 150, 20, 16, 12), isReal: false },
    { mode: "taxi", durationMin: Math.max(3, Math.round(carDurationMin * 0.9)), fareYen: Math.round((500 + distanceKm * 420) / 10) * 10, isReal: false },
    { mode: "walk", durationMin: Math.max(1, Math.round((distanceKm / 4.5) * 60)), fareYen: 0, isReal: false },
  ];

  // The mock fallback already returns a walk-to-station leg + a train leg —
  // when that's what we got back, use those exact minutes for the train
  // row's duration instead of re-deriving them, so the two stay identical
  // rather than coincidentally close. Its fare stays our own train-rate
  // tieredFare estimate, though: the backend's overall estimatedFareYen for
  // this mock path is always priced at drive-style rates (see
  // getMockTransitSuggestion in maasProvider.ts), which would otherwise make
  // the train row show the same fare as the car row.
  if (real?.isMock && real.legs.length === 2) {
    const walkLeg = real.legs.find((l) => l.mode === "walk");
    const trainLeg = real.legs.find((l) => l.mode === "train");
    if (walkLeg && trainLeg) {
      const trainRow = rows.find((r) => r.mode === "train")!;
      trainRow.durationMin = walkLeg.durationMin + trainLeg.durationMin;
    }
  } else if (real && !real.isMock) {
    // Real Google-routed result: walk (short distance) or drive (longer).
    const targetMode: AccessMode = real.legs[0]?.mode === "drive" ? "car" : "walk";
    const row = rows.find((r) => r.mode === targetMode);
    if (row) {
      row.durationMin = real.totalDurationMin;
      row.fareYen = real.estimatedFareYen;
      row.isReal = true;
    }
  }

  return rows.filter((r) => r.mode !== "walk" || distanceKm <= WALK_DISTANCE_LIMIT_KM);
}

export function pickRecommendedMode(accessibility: boolean, hasCar: boolean, groupSize: GroupSize): AccessMode {
  if (accessibility) return hasCar ? "car" : "taxi";
  if (groupSize === "family" && !hasCar) return "bus";
  if (hasCar) return "car";
  return "train";
}

const STATIC_TAG_KEYS: Record<AccessMode, [string, string]> = {
  train: ["reelAccessPage.tagWeatherProof", "reelAccessPage.tagStationWalk"],
  bus: ["reelAccessPage.tagCheapFare", "reelAccessPage.tagFewDepartures"],
  car: ["reelAccessPage.tagLuggageOk", "reelAccessPage.tagParkingNeeded"],
  taxi: ["reelAccessPage.tagDoorToDoor", "reelAccessPage.tagPricierGroup"],
  walk: ["reelAccessPage.tagFreeCost", "reelAccessPage.tagLongDistanceHard"],
};

export function reasonTagKeys(
  mode: AccessMode,
  accessibility: boolean,
  hasCar: boolean,
  groupSize: GroupSize
): string[] {
  const tags: string[] = [];
  if (accessibility && (mode === "car" || mode === "taxi")) tags.push("reelAccessPage.tagAccessibilityFriendly");
  if (groupSize === "family" && (mode === "car" || mode === "bus")) tags.push("reelAccessPage.tagGroupFriendly");
  if (!hasCar && (mode === "train" || mode === "bus")) tags.push("reelAccessPage.tagNoCarNeeded");
  for (const key of STATIC_TAG_KEYS[mode]) {
    if (tags.length >= 3) break;
    if (!tags.includes(key)) tags.push(key);
  }
  return tags.slice(0, 3);
}
