import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { parseOtaLinks, serializeOtaLinks } from "../lib/otaLinks";
import { suggestDefaultOtaLinks } from "../services/otaProvider";
import { reelInclude, serializeReel } from "../lib/reelSerializer";
import { getFollowedIds } from "../lib/followState";
import { geocode, isGoogleMapsConfigured } from "../services/googleMaps";
import { getTransitSuggestion } from "../services/maasProvider";
import { parseDepartureTime } from "../lib/parseDepartureTime";

const router = Router();

export function serializeMunicipality(
  m: {
    id: string;
    name: string;
    prefecture: string;
    description: string;
    avatarUrl: string | null;
    accessInfo: string;
    lodgingInfo: string;
    restaurantInfo: string;
    otaLinks: string;
    nearestStationName: string;
    nearestStationLat: number | null;
    nearestStationLng: number | null;
    commentsEnabled: boolean;
    createdAt: Date;
    _count?: { followers: number };
    tourismSpots?: { id: string; name: string; description: string; createdAt: Date }[];
  },
  viewer: { isFollowing: boolean } = { isFollowing: false }
) {
  const otaLinks = parseOtaLinks(m.otaLinks);
  return {
    id: m.id,
    name: m.name,
    prefecture: m.prefecture,
    description: m.description,
    avatarUrl: m.avatarUrl,
    accessInfo: m.accessInfo,
    lodgingInfo: m.lodgingInfo,
    restaurantInfo: m.restaurantInfo,
    tourismSpots: m.tourismSpots ?? [],
    otaLinks: otaLinks.length > 0 ? otaLinks : suggestDefaultOtaLinks(m.name),
    nearestStationName: m.nearestStationName,
    nearestStationLat: m.nearestStationLat,
    nearestStationLng: m.nearestStationLng,
    maasConfigured: isGoogleMapsConfigured(),
    commentsEnabled: m.commentsEnabled,
    followerCount: m._count?.followers ?? 0,
    isFollowing: viewer.isFollowing,
    createdAt: m.createdAt,
  };
}

export const municipalityCountInclude = { _count: { select: { followers: true } } } as const;
export const tourismSpotsOrder = { tourismSpots: { orderBy: { createdAt: "asc" as const } } };
// Shared by both this router and auth.ts (login/register-municipality/me),
// so a municipality's serialized shape is identical no matter which endpoint
// produced it — see the comment on serializeMunicipality's callers in
// auth.ts for why that matters.
export const municipalityDetailInclude = { ...municipalityCountInclude, ...tourismSpotsOrder };

// List all municipalities (for directory / search)
router.get("/", async (_req, res) => {
  const list = await prisma.municipality.findMany({
    orderBy: { createdAt: "desc" },
    include: municipalityCountInclude,
  });
  res.json(list.map((m) => serializeMunicipality(m)));
});

// Public profile view. optionalAuth + per-reel likes so the reels array matches
// the same shape as the main feed (GET /api/reels) — this lets the frontend reuse
// the feed's grid/fullscreen-viewer components on the profile page unchanged.
router.get("/:id", optionalAuth, async (req, res) => {
  const followed = await getFollowedIds(req.auth?.userId);
  const m = await prisma.municipality.findUnique({
    where: { id: req.params.id },
    include: {
      ...municipalityDetailInclude,
      reels: {
        orderBy: { createdAt: "desc" },
        include: {
          ...reelInclude,
          likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
          saves: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
        },
      },
    },
  });
  if (!m) return res.status(404).json({ error: "自治体が見つかりません" });
  const reels = await Promise.all(
    m.reels.map((r) =>
      serializeReel(r, {
        likedByMe: Array.isArray((r as any).likes) && (r as any).likes.length > 0,
        savedByMe: Array.isArray((r as any).saves) && (r as any).saves.length > 0,
        ...followed,
      })
    )
  );
  res.json({
    ...serializeMunicipality(m, { isFollowing: followed.followedMunicipalityIds.has(m.id) }),
    reels,
  });
});

// Follow / unfollow a municipality — surfaces its reels (including its linked
// companies' posts) in the signed-in user's feed "フォロー中" tab.
router.post("/:id/follow", requireAuth, async (req, res) => {
  const municipality = await prisma.municipality.findUnique({ where: { id: req.params.id } });
  if (!municipality) return res.status(404).json({ error: "自治体が見つかりません" });

  await prisma.follow.upsert({
    where: { followerId_municipalityId: { followerId: req.auth!.userId, municipalityId: municipality.id } },
    create: { followerId: req.auth!.userId, municipalityId: municipality.id },
    update: {},
  });
  res.status(204).end();
});

router.delete("/:id/follow", requireAuth, async (req, res) => {
  await prisma.follow.deleteMany({ where: { followerId: req.auth!.userId, municipalityId: req.params.id } });
  res.status(204).end();
});

// "アクセス" tab route planner: given a starting point the visitor types in,
// estimate travel time / mode / fare from there to this municipality's
// reference station. No auth required — this is a user-initiated, one-shot
// lookup (unlike the automatic per-reel-view Directions calls elsewhere),
// so it doesn't add to that per-view API cost concern. Falls back to a
// deterministic mock (see maasProvider.ts) if Maps isn't configured or the
// typed origin can't be geocoded, so the feature never dead-ends.
router.get("/:id/access-plan", async (req, res) => {
  const origin = typeof req.query.origin === "string" ? req.query.origin.trim() : "";
  if (!origin) return res.status(400).json({ error: "出発地点を入力してください" });

  const municipality = await prisma.municipality.findUnique({ where: { id: req.params.id } });
  if (!municipality) return res.status(404).json({ error: "自治体が見つかりません" });
  if (municipality.nearestStationLat == null || municipality.nearestStationLng == null) {
    return res.status(400).json({ error: "この自治体はまだ起点駅が設定されていません" });
  }

  let originCoords: { lat: number; lng: number } | null = null;
  if (isGoogleMapsConfigured()) {
    try {
      const geocoded = await geocode(origin);
      if (geocoded) originCoords = { lat: geocoded.lat, lng: geocoded.lng };
    } catch (err) {
      console.error("[municipalities] Geocoding access-plan origin failed:", err);
    }
  }

  const suggestion = await getTransitSuggestion(
    municipality.nearestStationName || municipality.name,
    municipality.nearestStationLat,
    municipality.nearestStationLng,
    { label: origin, ...originCoords },
    parseDepartureTime(req.query.datetime)
  );
  res.json(suggestion);
});

// Get own profile (municipality-only)
router.get("/me/profile", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const m = await prisma.municipality.findUnique({
    where: { userId: req.auth!.userId },
    include: municipalityDetailInclude,
  });
  if (!m) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });
  res.json(serializeMunicipality(m));
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  prefecture: z.string().min(1).optional(),
  description: z.string().optional(),
  accessInfo: z.string().optional(),
  lodgingInfo: z.string().optional(),
  restaurantInfo: z.string().optional(),
  otaLinks: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).optional(),
  nearestStationName: z.string().optional(),
  commentsEnabled: z.boolean().optional(),
});

// Update own profile (municipality-only)
router.put("/me/profile", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const { otaLinks, nearestStationName, ...rest } = parsed.data;

  // Re-geocode the reference station whenever its name changes, so transit
  // distances (see maasProvider.ts) are computed from an accurate origin point.
  let stationCoords: { nearestStationLat: number | null; nearestStationLng: number | null } | null = null;
  if (nearestStationName !== undefined && nearestStationName !== existing.nearestStationName) {
    if (nearestStationName.trim() === "") {
      stationCoords = { nearestStationLat: null, nearestStationLng: null };
    } else if (isGoogleMapsConfigured()) {
      let result: Awaited<ReturnType<typeof geocode>> = null;
      try {
        result = await geocode(nearestStationName);
      } catch (err) {
        console.error("[municipalities] Geocoding failed:", err);
      }
      if (!result) {
        return res.status(400).json({ error: "起点駅の場所を特定できませんでした。表記を見直してください。" });
      }
      stationCoords = { nearestStationLat: result.lat, nearestStationLng: result.lng };
    }
  }

  const updated = await prisma.municipality.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(nearestStationName !== undefined ? { nearestStationName } : {}),
      ...(stationCoords ?? {}),
      ...(otaLinks ? { otaLinks: serializeOtaLinks(otaLinks) } : {}),
    },
    include: municipalityDetailInclude,
  });
  res.json(serializeMunicipality(updated));
});

// Upload / replace avatar (municipality-only)
router.post(
  "/me/avatar",
  requireAuth,
  requireRole("MUNICIPALITY"),
  upload.single("avatar"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "ファイルがありません" });
    const existing = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
    if (!existing) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

    const updated = await prisma.municipality.update({
      where: { id: existing.id },
      data: { avatarUrl: `/uploads/${req.file.filename}` },
      include: municipalityDetailInclude,
    });
    res.json(serializeMunicipality(updated));
  }
);

const tourismSpotSchema = z.object({
  name: z.string().min(1, "スポット名を入力してください").max(100),
  description: z.string().max(2000).optional().default(""),
});

// Tourism spots CRUD (municipality-only, own municipality) — each entry is one
// attraction within the municipality's jurisdiction, replacing the old
// single free-text tourismInfo field so a municipality can list them out
// individually. Shown as a list on the public profile's 観光情報 tab.
router.post("/me/tourism-spots", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const parsed = tourismSpotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const spot = await prisma.tourismSpot.create({
    data: { municipalityId: municipality.id, name: parsed.data.name, description: parsed.data.description },
  });
  res.status(201).json(spot);
});

router.put("/me/tourism-spots/:spotId", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const parsed = tourismSpotSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const spot = await prisma.tourismSpot.findUnique({ where: { id: req.params.spotId } });
  if (!spot || spot.municipalityId !== municipality.id) {
    return res.status(404).json({ error: "観光スポットが見つかりません" });
  }

  const updated = await prisma.tourismSpot.update({ where: { id: spot.id }, data: parsed.data });
  res.json(updated);
});

router.delete("/me/tourism-spots/:spotId", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const spot = await prisma.tourismSpot.findUnique({ where: { id: req.params.spotId } });
  if (!spot || spot.municipalityId !== municipality.id) {
    return res.status(404).json({ error: "観光スポットが見つかりません" });
  }

  await prisma.tourismSpot.delete({ where: { id: spot.id } });
  res.status(204).end();
});

// Companies linked to this municipality (read-only — companies join themselves by
// picking this municipality at registration; see POST /api/auth/register-company).
router.get("/me/companies", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const companies = await prisma.company.findMany({
    where: { municipalityId: municipality.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true },
  });
  res.json(companies);
});

export default router;
