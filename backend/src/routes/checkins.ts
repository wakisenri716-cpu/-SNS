import { Router } from "express";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { getUserPoints } from "../lib/points";

// 現地スタンプのタグ: an NFC tag or printed QR code at a spot opens
// /c/:token (see Reel.checkinToken). Being able to read it is the proof of
// being there, so the stamp is given without GPS — a token found elsewhere
// (a photo of the QR) would work too, which is why the post's manager can
// make a new one at any time.
const router = Router();

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

async function spotOf(token: string) {
  if (!TOKEN.test(token)) return null;
  return prisma.reel.findUnique({
    where: { checkinToken: token },
    select: {
      id: true,
      videoUrl: true,
      locationName: true,
      caption: true,
      municipality: { select: { id: true, name: true, prefecture: true } },
    },
  });
}

const serializeSpot = (s: NonNullable<Awaited<ReturnType<typeof spotOf>>>) => ({
  id: s.id,
  videoUrl: s.videoUrl,
  locationName: s.locationName || s.caption.slice(0, 30),
  municipality: s.municipality,
});

// Which spot the tag is for, and (signed in) whether you already have its stamp.
router.get("/:token", optionalAuth, async (req, res) => {
  const spot = await spotOf(req.params.token);
  if (!spot) return res.status(404).json({ error: "このタグは使えません（作り直された可能性があります）" });
  const visit = req.auth ? await prisma.visit.findUnique({ where: { userId_reelId: { userId: req.auth.userId, reelId: spot.id } } }) : null;
  res.json({ spot: serializeSpot(spot), visitedAt: visit?.createdAt ?? null });
});

router.post("/:token", requireAuth, requireRole("USER"), writeLimiter, async (req, res) => {
  const spot = await spotOf(req.params.token);
  if (!spot) return res.status(404).json({ error: "このタグは使えません（作り直された可能性があります）" });
  const userId = req.auth!.userId;
  const existing = await prisma.visit.findUnique({ where: { userId_reelId: { userId, reelId: spot.id } } });
  const visit = existing ?? (await prisma.visit.create({ data: { userId, reelId: spot.id, method: "tag" } }));
  res.json({ spot: serializeSpot(spot), visitedAt: visit.createdAt, alreadyVisited: !!existing, ...(await getUserPoints(userId)) });
});

export default router;
