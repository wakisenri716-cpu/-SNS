export interface TransitLeg {
  mode: "walk" | "train" | "bus";
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
  isMock: true;
}

/**
 * MaaS (Mobility as a Service) integration placeholder.
 *
 * Real transit routing requires a contracted provider (e.g. a regional MaaS API or
 * a routing service with an API key), which this project does not have. This
 * function returns a deterministic, clearly-labeled mock so the UI/UX can be built
 * and demoed end-to-end. Swap the implementation for a real provider call later —
 * the function signature and TransitSuggestion shape are the integration point.
 */
export function getMockTransitSuggestion(
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
    originLabel: "最寄り駅",
    destinationLabel,
    destinationLat,
    destinationLng,
    totalDurationMin: walkMin + trainMin,
    legs: [
      { mode: "walk", description: "最寄り駅まで徒歩", durationMin: walkMin },
      { mode: "train", description: `${destinationLabel}最寄り駅まで電車`, durationMin: trainMin },
    ],
    isMock: true,
  };
}
