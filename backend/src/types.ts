export type Role = "USER" | "MUNICIPALITY" | "COMPANY";

export const REEL_CATEGORIES = ["nature", "culture", "activity", "lodging", "restaurant"] as const;
export type ReelCategory = (typeof REEL_CATEGORIES)[number];

// Transport modes a traveler can report an actual travel time for — the same
// five the access page compares (see frontend lib/accessModeEstimate.ts).
export const TRAVEL_MODES = ["train", "bus", "car", "taxi", "walk"] as const;

// Who a traveler usually travels with — Settings' 旅行スタイル, matched against
// posts' travelerTags to personalize the おすすめ feed.
export const TRAVEL_COMPANIONS = ["solo", "couple", "family", "friends"] as const;
export type TravelCompanion = (typeof TRAVEL_COMPANIONS)[number];

// Who/what a posted spot suits, chosen by the posting municipality/company —
// the pitch deck's 子供連れ・カップル・外国人・障害の有無に合わせた情報.
export const TRAVELER_TAGS = ["barrierFree", "familyFriendly", "couples", "friends", "multilingual"] as const;
export type TravelerTag = (typeof TRAVELER_TAGS)[number];

// Accepts the tags as an array (JSON body) or a comma-separated string
// (multipart upload form), keeping only known tags, deduplicated and in
// canonical order.
export function parseTravelerTags(input: unknown): TravelerTag[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const wanted = new Set(raw.map((v) => String(v).trim()));
  return TRAVELER_TAGS.filter((tag) => wanted.has(tag));
}

// Self-reported at registration or from Settings (optional). Covers Japan's top
// inbound-tourism source countries plus a few other common ones, with "other" as
// a catch-all — see GET /reels/mine/demographics for how this is aggregated.
export const NATIONALITIES = [
  "japan",
  "china",
  "taiwan",
  "hong_kong",
  "south_korea",
  "thailand",
  "singapore",
  "vietnam",
  "philippines",
  "indonesia",
  "usa",
  "canada",
  "uk",
  "france",
  "germany",
  "australia",
  "other",
] as const;
export type Nationality = (typeof NATIONALITIES)[number];

export const AGE_BUCKETS = ["under20", "20s", "30s", "40s", "50s", "60plus"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageBucketFromBirthYear(birthYear: number, now: Date = new Date()): AgeBucket {
  const age = now.getFullYear() - birthYear;
  if (age < 20) return "under20";
  if (age < 30) return "20s";
  if (age < 40) return "30s";
  if (age < 50) return "40s";
  if (age < 60) return "50s";
  return "60plus";
}

export interface AuthTokenPayload {
  userId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export {};
