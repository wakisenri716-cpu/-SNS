import { Request, Response, Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { reelInclude, serializeReel } from "../lib/reelSerializer";

const router = Router();

// Resolves the municipality/company a MUNICIPALITY or COMPANY user is allowed to
// post as. Returns null (with the response already sent) if their profile is
// missing — e.g. the demo database reset independently of their login token.
async function resolvePosterContext(
  req: Request,
  res: Response
): Promise<{ municipalityId: string; companyId: string | null } | null> {
  if (req.auth!.role === "MUNICIPALITY") {
    const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
    if (!municipality) {
      res.status(404).json({ error: "自治体プロフィールが見つかりません" });
      return null;
    }
    return { municipalityId: municipality.id, companyId: null };
  }

  const company = await prisma.company.findUnique({ where: { userId: req.auth!.userId } });
  if (!company) {
    res.status(404).json({ error: "企業プロフィールが見つかりません" });
    return null;
  }
  return { municipalityId: company.municipalityId, companyId: company.id };
}

// Feed: main "おすすめ" reel feed, newest first (paginated)
router.get("/", optionalAuth, async (req, res) => {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const take = 10;

  const reels = await prisma.reel.findMany({
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });

  const items = reels.map((r) => serializeReel(r, Array.isArray((r as any).likes) && (r as any).likes.length > 0));
  const nextCursor = reels.length === take ? reels[reels.length - 1].id : null;
  res.json({ items, nextCursor });
});

// Reels the signed-in user has liked (used by the read-only tourist "マイページ").
// Must be registered before "/:id" so "liked" isn't matched as a reel id.
router.get("/liked", requireAuth, async (req, res) => {
  const likes = await prisma.like.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    include: { reel: { include: reelInclude } },
  });

  res.json({ items: likes.map((l) => serializeReel(l.reel, true)) });
});

// Reels the signed-in municipality/company account is allowed to manage — all
// reels under the municipality (including affiliated companies' posts) for a
// municipality account, or only its own posts for a company account.
// Must be registered before "/:id" so "mine" isn't matched as a reel id.
router.get("/mine", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reels = await prisma.reel.findMany({
    where: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
    orderBy: { createdAt: "desc" },
    include: reelInclude,
  });

  res.json({ items: reels.map((r) => serializeReel(r, false)) });
});

router.get("/:id", optionalAuth, async (req, res) => {
  const reel = await prisma.reel.findUnique({
    where: { id: req.params.id },
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  await prisma.reel.update({ where: { id: reel.id }, data: { viewCount: { increment: 1 } } });

  res.json(serializeReel(reel, Array.isArray((reel as any).likes) && (reel as any).likes.length > 0));
});

const createSchema = z.object({
  caption: z.string().max(2000).optional().default(""),
  locationName: z.string().max(200).optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
});

// Create reel. Only municipality accounts and companies linked to a municipality
// may post — enforced by requireRole here, with the actual municipality/company
// resolved per-account in resolvePosterContext.
router.post(
  "/",
  requireAuth,
  requireRole("MUNICIPALITY", "COMPANY"),
  upload.single("video"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "動画ファイルがありません" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const poster = await resolvePosterContext(req, res);
    if (!poster) return;

    const reel = await prisma.reel.create({
      data: {
        municipalityId: poster.municipalityId,
        companyId: poster.companyId,
        videoUrl: `/uploads/${req.file.filename}`,
        caption: parsed.data.caption,
        locationName: parsed.data.locationName,
        locationLat: parsed.data.locationLat,
        locationLng: parsed.data.locationLng,
      },
      include: reelInclude,
    });

    res.status(201).json(serializeReel(reel, false));
  }
);

const updateSchema = z.object({
  caption: z.string().max(2000).optional(),
  locationName: z.string().max(200).optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
});

// A municipality may edit/delete any reel under its name (including ones posted by
// its linked companies, for moderation); a company may only edit/delete its own.
function canManage(
  reel: { municipalityId: string; companyId: string | null },
  poster: { municipalityId: string; companyId: string | null }
) {
  if (poster.companyId) return reel.companyId === poster.companyId;
  return reel.municipalityId === poster.municipalityId;
}

router.put("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || !canManage(reel, poster)) {
    return res.status(404).json({ error: "投稿が見つかりません" });
  }

  const updated = await prisma.reel.update({
    where: { id: reel.id },
    data: parsed.data,
    include: reelInclude,
  });
  res.json(serializeReel(updated, false));
});

router.delete("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || !canManage(reel, poster)) {
    return res.status(404).json({ error: "投稿が見つかりません" });
  }

  await prisma.reel.delete({ where: { id: reel.id } });
  res.status(204).end();
});

// Like / unlike (general users)
router.post("/:id/like", requireAuth, async (req, res) => {
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  await prisma.like.upsert({
    where: { userId_reelId: { userId: req.auth!.userId, reelId: reel.id } },
    create: { userId: req.auth!.userId, reelId: reel.id },
    update: {},
  });
  res.status(204).end();
});

router.delete("/:id/like", requireAuth, async (req, res) => {
  await prisma.like.deleteMany({ where: { userId: req.auth!.userId, reelId: req.params.id } });
  res.status(204).end();
});

// Comments
const commentSchema = z.object({ body: z.string().min(1).max(500) });

router.get("/:id/comments", async (req, res) => {
  const comments = await prisma.comment.findMany({
    where: { reelId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(comments);
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  const comment = await prisma.comment.create({
    data: { body: parsed.data.body, reelId: reel.id, userId: req.auth!.userId },
    include: { user: { select: { id: true, name: true } } },
  });
  res.status(201).json(comment);
});

export default router;
