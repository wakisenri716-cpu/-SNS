import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { parseOtaLinks, serializeOtaLinks } from "../lib/otaLinks";
import { suggestDefaultOtaLinks } from "../services/otaProvider";
import { reelInclude, serializeReel } from "../lib/reelSerializer";
import { geocode, isGoogleMapsConfigured } from "../services/googleMaps";

const router = Router();

function serializeMunicipality(m: {
  id: string;
  name: string;
  prefecture: string;
  description: string;
  avatarUrl: string | null;
  accessInfo: string;
  lodgingInfo: string;
  restaurantInfo: string;
  tourismInfo: string;
  otaLinks: string;
  nearestStationName: string;
  nearestStationLat: number | null;
  nearestStationLng: number | null;
  createdAt: Date;
}) {
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
    tourismInfo: m.tourismInfo,
    otaLinks: otaLinks.length > 0 ? otaLinks : suggestDefaultOtaLinks(m.name),
    nearestStationName: m.nearestStationName,
    nearestStationLat: m.nearestStationLat,
    nearestStationLng: m.nearestStationLng,
    maasConfigured: isGoogleMapsConfigured(),
    createdAt: m.createdAt,
  };
}

// List all municipalities (for directory / search)
router.get("/", async (_req, res) => {
  const list = await prisma.municipality.findMany({ orderBy: { createdAt: "desc" } });
  res.json(list.map(serializeMunicipality));
});

// Public profile view. optionalAuth + per-reel likes so the reels array matches
// the same shape as the main feed (GET /api/reels) — this lets the frontend reuse
// the feed's grid/fullscreen-viewer components on the profile page unchanged.
router.get("/:id", optionalAuth, async (req, res) => {
  const m = await prisma.municipality.findUnique({
    where: { id: req.params.id },
    include: {
      reels: {
        orderBy: { createdAt: "desc" },
        include: {
          ...reelInclude,
          likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
        },
      },
    },
  });
  if (!m) return res.status(404).json({ error: "自治体が見つかりません" });
  const reels = await Promise.all(
    m.reels.map((r) => serializeReel(r, Array.isArray((r as any).likes) && (r as any).likes.length > 0))
  );
  res.json({ ...serializeMunicipality(m), reels });
});

// Get own profile (municipality-only)
router.get("/me/profile", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const m = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
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
  tourismInfo: z.string().optional(),
  otaLinks: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).optional(),
  nearestStationName: z.string().optional(),
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
      const result = await geocode(nearestStationName);
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
    });
    res.json(serializeMunicipality(updated));
  }
);

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
