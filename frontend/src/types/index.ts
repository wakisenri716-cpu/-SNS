export type Role = "USER" | "MUNICIPALITY";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
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
  createdAt: string;
  reels?: Reel[];
}

export interface TransitSuggestion {
  originLabel: string;
  destinationLabel: string;
  totalDurationMin: number;
  legs: { mode: string; description: string; durationMin: number }[];
  isMock: true;
}

export interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  viewCount: number;
  createdAt: string;
  municipality: { id: string; name: string; avatarUrl: string | null; prefecture: string };
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
