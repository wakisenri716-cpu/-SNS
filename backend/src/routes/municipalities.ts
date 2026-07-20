import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { parseOtaLinks, serializeOtaLinks } from "../lib/otaLinks";
import { suggestDefaultOtaLinks } from "../services/otaProvider";

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
    createdAt: m.createdAt,
  };
}

// List all municipalities (for directory / search)
router.get("/", async (_req, res) => {
  const list = await prisma.municipality.findMany({ orderBy: { createdAt: "desc" } });
  res.json(list.map(serializeMunicipality));
});

// Public profile view
router.get("/:id", async (req, res) => {
  const m = await prisma.municipality.findUnique({
    where: { id: req.params.id },
    include: {
      reels: {
        orderBy: { createdAt: "desc" },
        include: { company: { select: { id: true, name: true } } },
      },
    },
  });
  if (!m) return res.status(404).json({ error: "自治体が見つかりません" });
  const reels = m.reels.map(({ company, ...reel }) => ({ ...reel, postedByCompany: company ?? null }));
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
});

// Update own profile (municipality-only)
router.put("/me/profile", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const { otaLinks, ...rest } = parsed.data;
  const updated = await prisma.municipality.update({
    where: { id: existing.id },
    data: {
      ...rest,
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
