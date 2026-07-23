export type Role = "USER" | "MUNICIPALITY" | "COMPANY";

export const REEL_CATEGORIES = ["nature", "culture", "activity", "lodging", "restaurant"] as const;
export type ReelCategory = (typeof REEL_CATEGORIES)[number];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  notifyOnLike: boolean;
  notifyOnComment: boolean;
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
  municipality: { id: string; name: string; avatarUrl: string | null; prefecture: string };
  postedByCompany: { id: string; name: string } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  transitSuggestion: TransitSuggestion | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string };
}
