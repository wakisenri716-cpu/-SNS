import { getMockTransitSuggestion } from "../services/maasProvider";

export const reelInclude = {
  municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
  company: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true } },
} as const;

export function serializeReel(
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
    municipality: { id: string; name: string; avatarUrl: string | null; prefecture: string };
    company?: { id: string; name: string } | null;
    _count?: { likes: number; comments: number };
  },
  likedByMe: boolean
) {
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
    municipality: reel.municipality,
    postedByCompany: reel.company ?? null,
    likeCount: reel._count?.likes ?? 0,
    commentCount: reel._count?.comments ?? 0,
    likedByMe,
    transitSuggestion:
      reel.locationName && reel.locationLat != null && reel.locationLng != null
        ? getMockTransitSuggestion(reel.locationName, reel.locationLat, reel.locationLng)
        : null,
  };
}
