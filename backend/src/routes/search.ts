import { Router } from "express";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";
import { anonymousViewerState, reelInclude, serializeReel } from "../lib/reelSerializer";
import { parseTravelerTags } from "../types";

const router = Router();

const SEARCH_LIMIT = 20;
// Tag-only searches scan this many recent posts; plenty for the current scale.
const TAG_SEARCH_POOL = 200;

// Keyword search across municipalities and reel captions/place names, and/or
// a ?tags= filter (comma-separated TRAVELER_TAGS; a post must have all of
// them) — e.g. "バリアフリー対応" alone finds every barrier-free post. Tags
// are matched in code rather than with SQL LIKE on the comma-separated
// column, so one tag name can never accidentally match inside another.
router.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const tags = parseTravelerTags(req.query.tags);
  if (!q && tags.length === 0) return res.json({ municipalities: [], reels: [] });

  const [municipalities, candidates] = await Promise.all([
    q
      ? prisma.municipality.findMany({
          where: {
            OR: [
              { name: { contains: q } },
              { kana: { contains: q } },
              { prefecture: { contains: q } },
              { description: { contains: q } },
              { tourismSpots: { some: { OR: [{ name: { contains: q } }, { description: { contains: q } }] } } },
            ],
          },
          // Joined municipalities before pages made from public data.
          orderBy: [{ listing: "asc" }, { lgCode: "asc" }],
          take: SEARCH_LIMIT,
        })
      : Promise.resolve([]),
    prisma.reel.findMany({
      where: q ? { OR: [{ caption: { contains: q } }, { locationName: { contains: q } }] } : {},
      take: tags.length > 0 ? TAG_SEARCH_POOL : SEARCH_LIMIT,
      orderBy: { createdAt: "desc" },
      include: reelInclude,
    }),
  ]);

  const matching = candidates
    .filter((r) => {
      const reelTags = parseTravelerTags(r.travelerTags);
      return tags.every((tag) => reelTags.includes(tag));
    })
    .slice(0, SEARCH_LIMIT);

  res.json({
    municipalities,
    reels: await Promise.all(matching.map((r) => serializeReel(r, anonymousViewerState()))),
  });
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
