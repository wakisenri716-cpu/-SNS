import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";
import { conciergeLimiter } from "../middleware/rateLimit";
import { getFollowedIds } from "../lib/followState";
import { reelInclude, serializeReel } from "../lib/reelSerializer";
import { isAiConciergeConfigured, runConcierge, runPhotoConcierge } from "../services/concierge";
import { logClaudeError } from "../services/claude";
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
      // Trimmed rather than rejected: an over-long earlier answer mustn't
      // make the next question fail.
      z.object({
        question: z.string().transform((v) => v.slice(0, 300)),
        reply: z.string().transform((v) => v.slice(0, 1000)),
        pickIds: z.array(z.string().max(40)).transform((v) => v.slice(0, 10)),
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

// The newest posts the concierge chooses from, with the viewer's like/save state.
async function loadCandidates(userId: string | undefined) {
  const reels = await prisma.reel.findMany({
    take: CANDIDATE_POOL,
    orderBy: { createdAt: "desc" },
    include: {
      ...reelInclude,
      likes: userId ? { where: { userId }, select: { id: true } } : false,
      saves: userId ? { where: { userId }, select: { id: true } } : false,
    },
  });
  const candidates = reels.map((r) => ({
    id: r.id,
    caption: r.caption,
    category: r.category,
    travelerTags: parseTravelerTags(r.travelerTags),
    locationName: r.locationName,
    municipalityName: r.company?.name ?? r.municipality.name,
    prefecture: r.municipality.prefecture,
    bestMonths: parseBestMonths(r.bestMonths),
  }));
  return { reels, candidates };
}

async function respond(
  res: Response,
  userId: string | undefined,
  reels: Awaited<ReturnType<typeof loadCandidates>>["reels"],
  result: Awaited<ReturnType<typeof runConcierge>>
) {
  const followed = await getFollowedIds(userId);
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
}

router.post("/", conciergeLimiter, optionalAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "相談内容を入力してください（300文字まで）" });
  const { reels, candidates } = await loadCandidates(req.auth?.userId);
  const result = await runConcierge(parsed.data.message, parsed.data.lang, candidates, parsed.data.history);
  await respond(res, req.auth?.userId, reels, result);
});

// 写真で探す: the traveler sends a photo of a scene (resized on the device to
// about 1024px JPEG); Claude picks posts with a similar feel. AI only — 503
// without ANTHROPIC_API_KEY. The photo is used for this one request and not
// stored. (Its JSON body limit is raised for this route in app.ts.)
const photoSchema = z.object({
  image: z
    .string()
    .max(3_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  lang: z.enum(["ja", "en", "zh", "ko"]).default("ja"),
});

router.post("/photo", conciergeLimiter, optionalAuth, async (req, res) => {
  if (!isAiConciergeConfigured()) return res.status(503).json({ error: "写真で探す機能は現在利用できません" });
  const parsed = photoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "画像（JPEG・PNG・WebP）を送ってください" });
  const [, kind, data] = parsed.data.image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)!;
  const { reels, candidates } = await loadCandidates(req.auth?.userId);
  try {
    const result = await runPhotoConcierge({ mediaType: `image/${kind}` as "image/jpeg", data }, parsed.data.lang, candidates);
    await respond(res, req.auth?.userId, reels, result);
  } catch (err) {
    logClaudeError("photo concierge", err);
    res.status(502).json({ error: "写真を読み取れませんでした。しばらくしてからもう一度お試しください" });
  }
});

export default router;
