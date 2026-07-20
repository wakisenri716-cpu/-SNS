import { Router } from "express";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";

const router = Router();

// Keyword search across municipalities and reel captions.
router.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.json({ municipalities: [], reels: [] });

  const [municipalities, reels] = await Promise.all([
    prisma.municipality.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { prefecture: { contains: q } },
          { description: { contains: q } },
          { tourismInfo: { contains: q } },
        ],
      },
      take: 20,
    }),
    prisma.reel.findMany({
      where: {
        OR: [{ caption: { contains: q } }, { locationName: { contains: q } }],
      },
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
      },
    }),
  ]);

  res.json({ municipalities, reels });
});

/**
 * "AI recommend" endpoint.
 *
 * This is a transparent rule-based scoring heuristic (recency + engagement, with a
 * light boost for prefectures the signed-in user has previously liked reels from) —
 * not a call to a large language model. It's a placeholder for a real recommender
 * (e.g. an LLM-based or collaborative-filtering model) that can be swapped in later
 * without changing this route's response shape.
 */
router.get("/recommend", optionalAuth, async (req, res) => {
  const take = 20;
  const recentReels = await prisma.reel.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });

  let likedPrefectures = new Set<string>();
  if (req.auth) {
    const likedReels = await prisma.like.findMany({
      where: { userId: req.auth.userId },
      include: { reel: { include: { municipality: true } } },
    });
    likedPrefectures = new Set(likedReels.map((l) => l.reel.municipality.prefecture));
  }

  const now = Date.now();
  const scored = recentReels.map((r) => {
    const ageHours = (now - r.createdAt.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - ageHours);
    const engagementScore = r._count.likes * 5 + r._count.comments * 3 + r.viewCount * 0.5;
    const prefectureBoost = likedPrefectures.has(r.municipality.prefecture) ? 50 : 0;
    return { reel: r, score: recencyScore + engagementScore + prefectureBoost };
  });

  scored.sort((a, b) => b.score - a.score);

  res.json({
    items: scored.slice(0, take).map(({ reel, score }) => ({
      id: reel.id,
      videoUrl: reel.videoUrl,
      caption: reel.caption,
      municipality: reel.municipality,
      likeCount: reel._count.likes,
      commentCount: reel._count.comments,
      score: Math.round(score),
    })),
    algorithm: "rule-based-v1",
  });
});

export default router;
