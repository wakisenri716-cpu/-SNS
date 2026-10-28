import { Router } from "express";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";
import { tripViewLimiter } from "../middleware/rateLimit";
import { buildItinerary } from "../lib/itinerary";

const router = Router();

// A しおり someone shared (POST /reels/itinerary/share): read-only, without
// their trip origin. Signed-in viewers also get which stops they've already
// saved, so the page can offer "add to my しおり".
router.get("/:token", tripViewLimiter, optionalAuth, async (req, res) => {
  const owner = await prisma.user.findUnique({
    where: { itineraryShareToken: req.params.token },
    select: { id: true, name: true },
  });
  if (!owner) return res.status(404).json({ error: "このしおりは共有が停止されたか、見つかりません" });

  const itinerary = await buildItinerary(owner.id, { withOrigin: false });
  const savedIds = req.auth
    ? (
        await prisma.savedReel.findMany({
          where: { userId: req.auth.userId, reelId: { in: itinerary.stops.map((s) => s.id) } },
          select: { reelId: true },
        })
      ).map((s) => s.reelId)
    : [];
  res.json({
    ownerName: owner.name,
    isMine: req.auth?.userId === owner.id,
    startTime: itinerary.startTime,
    stops: itinerary.stops,
    legs: itinerary.legs,
    savedIds,
  });
});

export default router;
