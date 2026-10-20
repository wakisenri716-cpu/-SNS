import { parseTravelerTags, REEL_CATEGORIES, type TravelCompanion, type TravelerTag } from "../types";

export interface TravelStyle {
  travelCompanion: string | null;
  needsBarrierFree: boolean;
  needsMultilingual: boolean;
  favoriteCategories: string;
}

// Why a post was ranked up for this user — shown next to it in the viewer, so
// the personalized order is explainable rather than a black box.
export type RecommendReason = "favoriteCategory" | "companion" | "barrierFree" | "multilingual";

const COMPANION_TAG: Partial<Record<TravelCompanion, TravelerTag>> = {
  couple: "couples",
  family: "familyFriendly",
  friends: "friends",
};

// Weights: an access need (barrier-free) outranks a taste (category). Posts
// that match nothing still appear, just after the matching ones.
const WEIGHTS: Record<RecommendReason, number> = {
  barrierFree: 4,
  multilingual: 3,
  favoriteCategory: 3,
  companion: 2,
};

export function parseFavoriteCategories(value: string): string[] {
  const wanted = new Set(value.split(",").map((v) => v.trim()));
  return REEL_CATEGORIES.filter((c) => wanted.has(c));
}

export function hasTravelStyle(style: TravelStyle) {
  return (
    !!style.travelCompanion ||
    style.needsBarrierFree ||
    style.needsMultilingual ||
    parseFavoriteCategories(style.favoriteCategories).length > 0
  );
}

export function scoreReel(reel: { category: string; travelerTags: string }, style: TravelStyle) {
  const tags = parseTravelerTags(reel.travelerTags);
  const reasons: RecommendReason[] = [];
  if (style.needsBarrierFree && tags.includes("barrierFree")) reasons.push("barrierFree");
  if (style.needsMultilingual && tags.includes("multilingual")) reasons.push("multilingual");
  if (parseFavoriteCategories(style.favoriteCategories).includes(reel.category)) reasons.push("favoriteCategory");
  const companionTag = COMPANION_TAG[style.travelCompanion as TravelCompanion];
  if (companionTag && tags.includes(companionTag)) reasons.push("companion");
  return { score: reasons.reduce((sum, r) => sum + WEIGHTS[r], 0), reasons };
}
