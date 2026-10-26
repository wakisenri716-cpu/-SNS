import type { ReelCategory } from "../types";

// Small visual cue next to category names (chips, cards).
export const CATEGORY_ICON: Record<ReelCategory | "all" | "saved" | "following", string> = {
  all: "✨",
  nature: "🌿",
  culture: "⛩️",
  activity: "🏄",
  lodging: "🏨",
  restaurant: "🍜",
  saved: "🔖",
  following: "👥",
};
