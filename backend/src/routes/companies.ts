import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

function serializeCompany(c: {
  id: string;
  name: string;
  municipalityId: string;
  avatarUrl: string | null;
  commentsEnabled: boolean;
  municipality: { id: string; name: string; prefecture: string };
}) {
  return {
    id: c.id,
    name: c.name,
    municipalityId: c.municipalityId,
    avatarUrl: c.avatarUrl,
    commentsEnabled: c.commentsEnabled,
    municipality: c.municipality,
  };
}

const companyInclude = {
  municipality: { select: { id: true, name: true, prefecture: true } },
} as const;

// Update own profile (company-only) — currently just the comments-enabled toggle.
const updateSchema = z.object({
  commentsEnabled: z.boolean().optional(),
});

router.put("/me/profile", requireAuth, requireRole("COMPANY"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.company.findUnique({ where: { userId: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: "企業プロフィールが見つかりません" });

  const updated = await prisma.company.update({
    where: { id: existing.id },
    data: parsed.data,
    include: companyInclude,
  });
  res.json(serializeCompany(updated));
});

// Follow / unfollow a company — surfaces its own reels in the signed-in user's
// feed "フォロー中" tab (following the parent municipality separately also
// covers a company's posts; this is for following just one company).
router.post("/:id/follow", requireAuth, async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) return res.status(404).json({ error: "企業が見つかりません" });

  await prisma.follow.upsert({
    where: { followerId_companyId: { followerId: req.auth!.userId, companyId: company.id } },
    create: { followerId: req.auth!.userId, companyId: company.id },
    update: {},
  });
  res.status(204).end();
});

router.delete("/:id/follow", requireAuth, async (req, res) => {
  await prisma.follow.deleteMany({ where: { followerId: req.auth!.userId, companyId: req.params.id } });
  res.status(204).end();
});

// Upload / replace avatar (company-only)
router.post("/me/avatar", requireAuth, requireRole("COMPANY"), upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "ファイルがありません" });
  const existing = await prisma.company.findUnique({ where: { userId: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: "企業プロフィールが見つかりません" });

  const updated = await prisma.company.update({
    where: { id: existing.id },
    data: { avatarUrl: `/uploads/${req.file.filename}` },
    include: companyInclude,
  });
  res.json(serializeCompany(updated));
});

export default router;
