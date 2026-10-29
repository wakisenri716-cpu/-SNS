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
  notifyOnNewPost: boolean;
  travelCompanion: TravelCompanion | null;
  needsBarrierFree: boolean;
  needsMultilingual: boolean;
  favoriteCategories: ReelCategory[];
}

// Settings' 旅行スタイル — mirrors TRAVEL_COMPANIONS in backend/src/types.ts.
export const TRAVEL_COMPANIONS = ["solo", "couple", "family", "friends"] as const;
export type TravelCompanion = (typeof TRAVEL_COMPANIONS)[number];
// Why the personalized おすすめ feed ranked a post up (backend lib/personalize.ts).
export type RecommendReason = "favoriteCategory" | "companion" | "barrierFree" | "multilingual";

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

// One tourist attraction within a municipality's jurisdiction, edited from
// the dashboard's 観光情報 tab — see backend/src/routes/municipalities.ts's
// tourism-spots CRUD routes.
export interface TourismSpot {
  id: string;
  name: string;
  description: string;
  // Optional; lets the spot appear in 近くの観光スポット.
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
}

// A located 観光情報 spot near a post (GET /reels/:id/nearby → spots).
export interface NearbyTourismSpot {
  id: string;
  name: string;
  description: string;
  municipality: { id: string; name: string };
  distanceMeters: number;
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
  tourismSpots: TourismSpot[];
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
  estimatedFareYen: number;
  departureAt: string;
  arrivalAt: string;
  isMock: boolean;
}

// Who/what a posted spot suits, set by the posting municipality/company.
// Mirrors TRAVELER_TAGS in backend/src/types.ts.
export const TRAVELER_TAGS = ["barrierFree", "familyFriendly", "couples", "friends", "multilingual"] as const;
export type TravelerTag = (typeof TRAVELER_TAGS)[number];

export interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  category: ReelCategory;
  travelerTags: TravelerTag[];
  // 見頃 months (1–12) set by the poster; empty if not stated.
  bestMonths: number[];
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
  // Only on items from the personalized おすすめ feed.
  recommendReasons?: RecommendReason[];
}

// A nearby-spots result row — a regular Reel plus its distance from the spot
// the viewer was just looking at. See GET /reels/:id/nearby.
export interface NearbyReel extends Reel {
  distanceMeters: number;
}

// 「みんなの実測」: travelers' self-reported actual travel times to one reel's
// location, averaged per starting point + mode. See GET /reels/:id/travel-reports.
export type TravelMode = "train" | "bus" | "car" | "taxi" | "walk";
export interface TravelReportGroup {
  originLabel: string;
  mode: TravelMode;
  count: number;
  averageMin: number;
}
export interface TravelReports {
  // Only starting points enough different users share (backend
  // lib/travelReports.ts); reports from rarer ones are just counted.
  summary: TravelReportGroup[];
  hiddenCount: number;
  mine: { mode: TravelMode; durationMin: number; originLabel: string }[];
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string };
}

// One stop in a trip's しおり — see GET /me/trips/:id/itinerary.
export interface ItineraryStop {
  id: string;
  caption: string;
  category: ReelCategory;
  locationName: string | null;
  locationLat: number;
  locationLng: number;
  videoUrl: string;
  municipality: { id: string; name: string; avatarUrl: string | null; prefecture: string };
  // Planned stay at this stop (PATCH /me/trips/:id/items/:reelId).
  stayMinutes: number;
}

export interface Itinerary {
  // The 旅 this しおり belongs to (GET /me/trips/:id/itinerary).
  trip: { id: string; name: string; startDate: string | null };
  // Trip settings (PATCH /me/trips/:id): where the trip starts — "" if
  // unset — and the start time of day, "HH:MM".
  originLabel: string;
  startTime: string;
  // Travel estimate from originLabel to the first stop.
  // Null without an origin, or when the origin couldn't be located (then
  // originLocated is false and the timeline starts at the first stop).
  originLeg: TransitSuggestion | null;
  originLocated: boolean;
  stops: ItineraryStop[];
  // legs[i] is the travel estimate from stops[i] to stops[i+1] — always
  // legs.length === stops.length - 1.
  legs: TransitSuggestion[];
  // Set while a read-only link (/trip/:token) to this しおり is shared.
  shareToken: string | null;
}

// A しおり someone shared (GET /trips/:token): no trip origin, read-only.
export interface SharedTrip {
  ownerName: string;
  tripName: string;
  startDate: string | null;
  isMine: boolean;
  startTime: string;
  stops: ItineraryStop[];
  legs: TransitSuggestion[];
  // Which of these stops the signed-in viewer has already saved.
  savedIds: string[];
}

// イベント情報 (GET /events). Dates are calendar days, "YYYY-MM-DD".
export interface EventItem {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locationName: string;
  url: string;
  municipality: { id: string; name: string; prefecture: string; avatarUrl: string | null };
  company: { id: string; name: string } | null;
}
