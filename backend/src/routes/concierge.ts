import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";
import { conciergeLimiter } from "../middleware/rateLimit";
import { checkAiQuota, recordAiUse } from "../lib/aiQuota";
import { getFollowedIds } from "../lib/followState";
import { REEL_ORDER, reelInclude, serializeReel } from "../lib/reelSerializer";
import { isAiConciergeConfigured, runConcierge, runPhotoConcierge } from "../services/concierge";
import { logClaudeError } from "../services/claude";
import { parseBestMonths, parseTravelerTags } from "../types";
import { todayInJapan } from "./events";

const router = Router();

// The concierge looks at this many posts: towns' own newest first, then
// Jaziba's introductions (REEL_ORDER).
const CANDIDATE_POOL = 120;

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
    orderBy: REEL_ORDER,
    include: {
      ...reelInclude,
      likes: userId ? { where: { userId }, select: { id: true } } : false,
      saves: userId ? { where: { userId }, select: { id: true } } : false,
    },
  });
  // 地元の交通情報 for these places: a spot's own, then its town's general ones.
  const transit = await prisma.localTransit.findMany({
    where: { municipalityId: { in: [...new Set(reels.map((r) => r.municipalityId))] }, OR: [{ validUntil: null }, { validUntil: { gte: todayInJapan() } }] },
    select: { reelId: true, municipalityId: true, title: true, body: true },
    orderBy: { updatedAt: "desc" },
  });
  const transitFor = (r: { id: string; municipalityId: string }) =>
    [...transit.filter((x) => x.reelId === r.id), ...transit.filter((x) => !x.reelId && x.municipalityId === r.municipalityId)]
      .slice(0, 2)
      .map((x) => `${x.title}: ${x.body.replace(/\s+/g, " ")}`.slice(0, 200));
  const candidates = reels.map((r) => ({
    id: r.id,
    caption: r.caption,
    category: r.category,
    travelerTags: parseTravelerTags(r.travelerTags),
    locationName: r.locationName,
    municipalityName: r.company?.name ?? r.municipality.name,
    prefecture: r.municipality.prefecture,
    bestMonths: parseBestMonths(r.bestMonths),
    localTransit: transitFor(r),
  }));
  return { reels, candidates };
}

async function respond(
  res: Response,
  userId: string | undefined,
  reels: Awaited<ReturnType<typeof loadCandidates>>["reels"],
  candidates: Awaited<ReturnType<typeof loadCandidates>>["candidates"],
  result: Awaited<ReturnType<typeof runConcierge>>
) {
  const followed = await getFollowedIds(userId);
  const byId = new Map(reels.map((r) => [r.id, r]));
  const transitById = new Map(candidates.map((c) => [c.id, (c.localTransit ?? []).length > 0]));
  const picks = await Promise.all(
    result.picks.map(async (p) => {
      const reel = byId.get(p.id)!;
      return {
        reason: p.reason,
        matched: p.matched,
        // The card links to the access page's 地元の交通情報.
        hasLocalTransit: transitById.get(p.id) ?? false,
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
  const quota = await checkAiQuota(req, res, "concierge");
  if (quota === "refused") return;
  const { reels, candidates } = await loadCandidates(req.auth?.userId);
  const result = await runConcierge(parsed.data.message, parsed.data.lang, candidates, parsed.data.history, { allowAi: quota === "ai" });
  if (result.mode === "ai") await recordAiUse(req, "concierge", result.usage);
  await respond(res, req.auth?.userId, reels, candidates, result);
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
  const quota = await checkAiQuota(req, res, "photoConcierge");
  if (quota === "refused") return;
  // No keyword fallback for a photo: say so when the app's AI budget is spent.
  if (quota === "noAi") return res.status(503).json({ code: "aiBusy", error: "写真で探す機能は混み合っているため、いまは使えません。しばらくしてからお試しください" });
  const [, kind, data] = parsed.data.image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)!;
  const { reels, candidates } = await loadCandidates(req.auth?.userId);
  try {
    const result = await runPhotoConcierge({ mediaType: `image/${kind}` as "image/jpeg", data }, parsed.data.lang, candidates);
    if (result.mode === "ai") await recordAiUse(req, "photoConcierge", result.usage);
    await respond(res, req.auth?.userId, reels, candidates, result);
  } catch (err) {
    logClaudeError("photo concierge", err);
    res.status(502).json({ error: "写真を読み取れませんでした。しばらくしてからもう一度お試しください" });
  }
});

export default router;
