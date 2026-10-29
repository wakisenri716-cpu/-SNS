import { getTransitSuggestion } from "../services/maasProvider";
import type { FollowedIds } from "./followState";
import { parseBestMonths, parseTravelerTags } from "../types";

// Towns' and businesses' own posts first (newest first), then Jaziba's
// introductions of towns that haven't joined (see Reel.editorial) — for the
// feed, the map and the AI's candidate posts.
export const REEL_ORDER = [{ editorial: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

export const reelInclude = {
  municipality: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      prefecture: true,
      nearestStationName: true,
      nearestStationLat: true,
      nearestStationLng: true,
    },
  },
  company: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true } },
} as const;

// Per-viewer state that isn't part of the reel row itself — whether *this*
// signed-in viewer liked/saved it, and whether they follow its poster. Callers
// build this once per request (see getFollowedIds) rather than querying per reel.
export interface ReelViewerState extends FollowedIds {
  likedByMe: boolean;
  savedByMe: boolean;
}

export function anonymousViewerState(): ReelViewerState {
  return {
    likedByMe: false,
    savedByMe: false,
    followedMunicipalityIds: new Set(),
    followedCompanyIds: new Set(),
  };
}

export async function serializeReel(
  reel: {
    id: string;
    videoUrl: string;
    thumbnailUrl: string | null;
    caption: string;
    category: string;
    travelerTags: string;
    bestMonths: string;
    locationName: string | null;
    locationLat: number | null;
    locationLng: number | null;
    viewCount: number;
    editorial?: boolean;
    createdAt: Date;
    municipality: {
      id: string;
      name: string;
      avatarUrl: string | null;
      prefecture: string;
      nearestStationName: string;
      nearestStationLat: number | null;
      nearestStationLng: number | null;
    };
    company?: { id: string; name: string } | null;
    _count?: { likes: number; comments: number };
  },
  viewer: ReelViewerState
) {
  const { nearestStationName, nearestStationLat, nearestStationLng, ...municipality } = reel.municipality;
  const origin =
    nearestStationLat != null && nearestStationLng != null
      ? { label: nearestStationName || "最寄り駅", lat: nearestStationLat, lng: nearestStationLng }
      : null;

  return {
    id: reel.id,
    videoUrl: reel.videoUrl,
    thumbnailUrl: reel.thumbnailUrl,
    caption: reel.caption,
    category: reel.category,
    travelerTags: parseTravelerTags(reel.travelerTags),
    bestMonths: parseBestMonths(reel.bestMonths),
    locationName: reel.locationName,
    locationLat: reel.locationLat,
    locationLng: reel.locationLng,
    viewCount: reel.viewCount,
    // Jaziba's own introduction, not the municipality's post (see Reel.editorial).
    editorial: reel.editorial ?? false,
    createdAt: reel.createdAt,
    municipality: { ...municipality, isFollowing: viewer.followedMunicipalityIds.has(municipality.id) },
    postedByCompany: reel.company
      ? { ...reel.company, isFollowing: viewer.followedCompanyIds.has(reel.company.id) }
      : null,
    likeCount: reel._count?.likes ?? 0,
    commentCount: reel._count?.comments ?? 0,
    likedByMe: viewer.likedByMe,
    savedByMe: viewer.savedByMe,
    transitSuggestion:
      reel.locationName && reel.locationLat != null && reel.locationLng != null
        ? await getTransitSuggestion(reel.locationName, reel.locationLat, reel.locationLng, origin)
        : null,
  };
}
