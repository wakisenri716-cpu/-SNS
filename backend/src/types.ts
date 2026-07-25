export type Role = "USER" | "MUNICIPALITY" | "COMPANY";

export const REEL_CATEGORIES = ["nature", "culture", "activity", "lodging", "restaurant"] as const;
export type ReelCategory = (typeof REEL_CATEGORIES)[number];

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
