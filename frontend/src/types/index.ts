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
  /** May open the 管理者サイト (/admin); the server checks again. */
  isAdmin?: boolean;
  /** 登録の承認 (municipality and company accounts); travelers are "approved". */
  approval?: "pending" | "approved" | "rejected";
  approvalNote?: string;
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
  /** "長野市役所" when the office position is known (directions fall back to it). */
  officeName: string | null;
  kana: string;
  websiteUrl: string;
  /** A page Jaziba made from public data; the municipality hasn't joined. */
  listing: boolean;
  tourismSpotCount?: number;
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
  /** What the typed origin was taken as (access plans only); null when it wasn't found. */
  originFound?: { label: string; kind: "google" | "station" | "town" | "municipality" | "prefecture" } | null;
}

// Who/what a posted spot suits, set by the posting municipality/company.
// Mirrors TRAVELER_TAGS in backend/src/types.ts.
export const TRAVELER_TAGS = ["barrierFree", "familyFriendly", "couples", "friends", "multilingual"] as const;
export type TravelerTag = (typeof TRAVELER_TAGS)[number];

export interface Reel {
  id: string;
  /** Made from a traveler's 提供された素材: their name if credited, "" if anonymous; null otherwise. */
  contributedBy?: string | null;
  /** The spot has an NFC / QR stamp tag (現地スタンプのタグ). */
  hasCheckinTag?: boolean;
  /** 楽天トラベルの宿 this lodging post is (booking opens there). */
  rakutenHotel?: { no: number; name: string } | null;
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
  /** Jaziba's introduction of a municipality that hasn't joined; the video is an illustration. */
  editorial?: boolean;
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

// 乗る便: a flight/train/bus the travellers booked, entered by them
// (GET /me/trips/:id/itinerary). seat/confirmation/note are "" on a shared link.
export interface TripTransport {
  id: string;
  /** Set when it's a ride of a leg's way (行き方の候補). */
  optionId?: string | null;
  kind: "plane" | "train" | "bus" | "ferry" | "other";
  name: string;
  operator: string;
  fromName: string;
  toName: string;
  departAt: string;
  arriveAt: string;
  departPlatform: string;
  arrivePlatform: string;
  seat: string;
  confirmation: string;
  note: string;
}

export type LegMode = "train" | "bus" | "car" | "taxi" | "walk" | "bike" | "plane" | "ferry" | "other";

// 区間の行き方: one way the travellers wrote down for a leg — from "origin"
// (the 出発地点) or a stop's id, to a stop's id. One per leg can be chosen.
export interface LegOption {
  id: string;
  fromId: string;
  toId: string;
  mode: LegMode;
  title: string;
  durationMin: number | null;
  fareYen: number | null;
  note: string;
  chosen: boolean;
  rides: TripTransport[];
}

// 旅のアルバム: a photo a member added (members only).
export interface TripPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  takenAt: string | null;
  /** The trip stop it was taken near (within 2 km), if any. */
  stopReelId: string | null;
  hasLocation: boolean;
  by: { id: string; name: string };
  isMine: boolean;
  createdAt: string;
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
  originFound?: { label: string; kind: "google" | "station" | "town" | "municipality" | "prefecture" } | null;
  stops: ItineraryStop[];
  // legs[i] is the travel estimate from stops[i] to stops[i+1] — always
  // legs.length === stops.length - 1.
  legs: TransitSuggestion[];
  transports?: TripTransport[];
  legOptions?: LegOption[];
  reservations?: TripReservation[];
  photos?: TripPhoto[];
  // Set while a read-only link (/trip/:token) to this しおり is shared
  // (owner only; null for members).
  shareToken: string | null;
  // 一緒に計画する: whether you made the trip, who did, who joined, and the
  // invite link while it's on (owner only).
  isOwner: boolean;
  owner: { id: string; name: string };
  members: { id: string; name: string }[];
  inviteToken: string | null;
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
  transports?: TripTransport[];
  // The way chosen for each leg (without notes or seats).
  legOptions?: LegOption[];
  reservations?: TripReservation[];
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

// 素材の提供: a traveler's photo/video offered to a municipality (GET /submissions/mine, /submissions/inbox).
export interface Submission {
  id: string;
  kind: "video" | "photo";
  fileUrl: string;
  description: string;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  takenAt: string | null;
  credit: boolean;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  reviewedAt: string | null;
  reelId: string | null;
  createdAt: string;
  points: number;
  municipality?: { id: string; name: string; prefecture: string };
  contributor?: { id: string; name: string };
}

// ポイントで交換 (GET /coupons, /coupons/mine, /coupons/issued).
export interface Coupon {
  id: string;
  title: string;
  description: string;
  terms: string;
  pointsCost: number;
  stock: number | null;
  remaining: number | null;
  perUserLimit: number;
  validUntil: string | null;
  active: boolean;
  open: boolean;
  issuer: { kind: "municipality" | "company"; id: string; name: string };
  municipality: { id: string; name: string; prefecture: string };
  mineCount: number;
  /** Issuer's list only. */
  exchanged?: number;
  used?: number;
}

export interface CouponRedemption {
  id: string;
  code: string;
  pointsSpent: number;
  usedAt: string | null;
  createdAt: string;
  coupon: Coupon;
  /** When the issuer looks a code up. */
  holder?: string;
  expired?: boolean;
}

// GET /points: the balance (earned − spent) and today's AI allowance.
export interface PointsSummary {
  points: number;
  earned: number;
  spent: number;
  reportCount: number;
  visitCount: number;
  submissionCount: number;
  ai: {
    /** The paid plan in use, if any (it raises the monthly and daily uses). */
    plan: PlanId | null;
    freePerMonth: number;
    freeMaxPerDay: number;
    /** Free uses left today (the month's rest, at most the day's limit). */
    freeLeft: number;
    freeLeftThisMonth: number;
    credits: number;
    /** How many uses each AI feature counts for. */
    units: Record<"concierge" | "photoConcierge" | "tripPlan" | "tripCompose" | "transitRead", number>;
    packs: { id: string; credits: number; points: number }[];
  };
}

export type PlanId = "plus" | "business" | "municipalityPro";

/** GET /billing: the 有料プラン and this account's current one. */
export interface BillingInfo {
  /** False until the operator connects Stripe (plans can't be bought yet). */
  paymentsReady: boolean;
  limits: Record<"free" | "paid", { aiPerMonth: number; aiPerDay: number; coupons: Record<"COMPANY" | "MUNICIPALITY", number> }>;
  plans: { id: PlanId; role: "USER" | "COMPANY" | "MUNICIPALITY"; priceYen: number | null; purchasable: boolean }[];
  current: {
    plan: PlanId;
    active: boolean;
    status: string;
    /** "stripe" (card) or "invoice" (turned on by the operator). */
    source: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

/** 地元の交通情報 (GET /local-transit): added by a municipality or a business. */
export interface LocalTransit {
  id: string;
  title: string;
  body: string;
  fileUrl: string | null;
  fileKind: "image" | "pdf" | null;
  fileName: string;
  sourceUrl: string | null;
  validUntil: string | null;
  /** The text began as the AI's reading of the file (checked by the poster). */
  aiDrafted: boolean;
  updatedAt: string;
  issuer: { kind: "municipality" | "company"; id: string; name: string };
  /** The spot it's for, or null for the whole municipality. */
  reel: { id: string; locationName: string | null } | null;
}

/** 予約明細 in a しおり. On a shared link: no booking number, price, payment, notes or page. */
export interface TripReservation {
  id: string;
  kind: "lodging" | "restaurant" | "activity" | "other";
  name: string;
  reelId: string | null;
  startAt: string;
  endAt: string | null;
  address: string;
  phone: string;
  confirmation: string;
  guests: number | null;
  planName: string;
  priceYen: number | null;
  payment: "paid" | "onsite" | "";
  bookedVia: string;
  url: string;
  note: string;
}
