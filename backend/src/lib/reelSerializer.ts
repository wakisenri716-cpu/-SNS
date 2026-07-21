import { getTransitSuggestion } from "../services/maasProvider";

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

export async function serializeReel(
  reel: {
    id: string;
    videoUrl: string;
    thumbnailUrl: string | null;
    caption: string;
    locationName: string | null;
    locationLat: number | null;
    locationLng: number | null;
    viewCount: number;
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
  likedByMe: boolean
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
    locationName: reel.locationName,
    locationLat: reel.locationLat,
    locationLng: reel.locationLng,
    viewCount: reel.viewCount,
    createdAt: reel.createdAt,
    municipality,
    postedByCompany: reel.company ?? null,
    likeCount: reel._count?.likes ?? 0,
    commentCount: reel._count?.comments ?? 0,
    likedByMe,
    transitSuggestion:
      reel.locationName && reel.locationLat != null && reel.locationLng != null
        ? await getTransitSuggestion(reel.locationName, reel.locationLat, reel.locationLng, origin)
        : null,
  };
}
