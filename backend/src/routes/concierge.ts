import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";
import { conciergeLimiter } from "../middleware/rateLimit";
import { getFollowedIds } from "../lib/followState";
import { reelInclude, serializeReel } from "../lib/reelSerializer";
import { isAiConciergeConfigured, runConcierge } from "../services/concierge";
import { parseBestMonths, parseTravelerTags } from "../types";

const router = Router();

// The concierge looks at this many of the newest posts.
const CANDIDATE_POOL = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(300),
  lang: z.enum(["ja", "en", "zh", "ko"]).default("ja"),
  // Earlier turns of the same conversation (the client keeps them), so
  // follow-ups like "子連れだと？" are understood. Only the last few matter.
  history: z
    .array(
      z.object({
        question: z.string().max(300),
        reply: z.string().max(1000),
        pickIds: z.array(z.string()).max(10),
      })
    )
    .max(20)
    .default([])
    .transform((h) => h.slice(-4)),
});

// Whether answers come from Claude or from keyword matching, so the UI can label them.
router.get("/status", (_req, res) => {
  res.json({ ai: isAiConciergeConfigured() });
});

router.post("/", conciergeLimiter, optionalAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "相談内容を入力してください（300文字まで）" });

  const reels = await prisma.reel.findMany({
    take: CANDIDATE_POOL,
    orderBy: { createdAt: "desc" },
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
      saves: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });

  const result = await runConcierge(
    parsed.data.message,
    parsed.data.lang,
    reels.map((r) => ({
      id: r.id,
      caption: r.caption,
      category: r.category,
      travelerTags: parseTravelerTags(r.travelerTags),
      locationName: r.locationName,
      municipalityName: r.company?.name ?? r.municipality.name,
      prefecture: r.municipality.prefecture,
      bestMonths: parseBestMonths(r.bestMonths),
    })),
    parsed.data.history
  );

  const followed = await getFollowedIds(req.auth?.userId);
  const byId = new Map(reels.map((r) => [r.id, r]));
  const picks = await Promise.all(
    result.picks.map(async (p) => {
      const reel = byId.get(p.id)!;
      return {
        reason: p.reason,
        matched: p.matched,
        reel: await serializeReel(reel, {
          likedByMe: Array.isArray(reel.likes) && reel.likes.length > 0,
          savedByMe: Array.isArray(reel.saves) && reel.saves.length > 0,
          ...followed,
        }),
      };
    })
  );

  res.json({ mode: result.mode, reply: result.reply, picks });
});

export default router;
