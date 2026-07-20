import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { getMockTransitSuggestion } from "../services/maasProvider";

const router = Router();

function serializeReel(
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
    likeCount: reel._count?.likes ?? 0,
    commentCount: reel._count?.comments ?? 0,
    likedByMe,
    transitSuggestion:
      reel.locationName && reel.locationLat != null && reel.locationLng != null
        ? getMockTransitSuggestion(reel.locationName, reel.locationLat, reel.locationLng)
        : null,
  };
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
      municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
      _count: { select: { likes: true, comments: true } },
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });

  const items = reels.map((r) => serializeReel(r, Array.isArray((r as any).likes) && (r as any).likes.length > 0));
  const nextCursor = reels.length === take ? reels[reels.length - 1].id : null;
  res.json({ items, nextCursor });
});

router.get("/:id", optionalAuth, async (req, res) => {
  const reel = await prisma.reel.findUnique({
    where: { id: req.params.id },
    include: {
      municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
      _count: { select: { likes: true, comments: true } },
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

// Create reel (municipality-only). Municipalities are the only accounts allowed
// to post reels — this restriction is enforced by requireRole here.
router.post(
  "/",
  requireAuth,
  requireRole("MUNICIPALITY"),
  upload.single("video"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "動画ファイルがありません" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
    if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

    const reel = await prisma.reel.create({
      data: {
        municipalityId: municipality.id,
        videoUrl: `/uploads/${req.file.filename}`,
        caption: parsed.data.caption,
        locationName: parsed.data.locationName,
        locationLat: parsed.data.locationLat,
        locationLng: parsed.data.locationLng,
      },
      include: {
        municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
        _count: { select: { likes: true, comments: true } },
      },
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

router.put("/:id", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || reel.municipalityId !== municipality.id) {
    return res.status(404).json({ error: "投稿が見つかりません" });
  }

  const updated = await prisma.reel.update({
    where: { id: reel.id },
    data: parsed.data,
    include: {
      municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });
  res.json(serializeReel(updated, false));
});

router.delete("/:id", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
  if (!municipality) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || reel.municipalityId !== municipality.id) {
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
