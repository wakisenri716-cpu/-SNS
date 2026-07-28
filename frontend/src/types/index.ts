export type Role = "USER" | "MUNICIPALITY" | "COMPANY";

export const REEL_CATEGORIES = ["nature", "culture", "activity", "lodging", "restaurant"] as const;
export type ReelCategory = (typeof REEL_CATEGORIES)[number];

// Optional, self-reported. Mirrors backend/src/types.ts — used only to power
// aggregated audience insights for municipality/company accounts.
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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  nationality: string | null;
  birthYear: number | null;
  notifyOnLike: boolean;
  notifyOnComment: boolean;
}

export interface Demographics {
  totalViews: number;
  byNationality: { nationality: string; count: number }[];
  byAgeBucket: { bucket: string; count: number }[];
}

export interface Company {
  id: string;
  name: string;
  municipalityId: string;
  avatarUrl: string | null;
  commentsEnabled: boolean;
  municipality: { id: string; name: string; prefecture: string };
}

export interface OtaLink {
  label: string;
  url: string;
}

export interface Municipality {
  id: string;
  name: string;
  prefecture: string;
  description: string;
  avatarUrl: string | null;
  accessInfo: string;
  lodgingInfo: string;
  restaurantInfo: string;
  tourismInfo: string;
  otaLinks: OtaLink[];
  nearestStationName: string;
  nearestStationLat: number | null;
  nearestStationLng: number | null;
  maasConfigured: boolean;
  commentsEnabled: boolean;
  followerCount: number;
  isFollowing: boolean;
  createdAt: string;
  reels?: Reel[];
}

export interface TransitSuggestion {
  originLabel: string;
  destinationLabel: string;
  totalDurationMin: number;
  legs: { mode: string; description: string; durationMin: number }[];
  isMock: boolean;
}

export interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  category: ReelCategory;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  viewCount: number;
  createdAt: string;
  municipality: { id: string; name: string; avatarUrl: string | null; prefecture: string; isFollowing: boolean };
  postedByCompany: { id: string; name: string; isFollowing: boolean } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  transitSuggestion: TransitSuggestion | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string };
}
