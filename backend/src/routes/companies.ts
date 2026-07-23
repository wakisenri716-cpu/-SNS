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
