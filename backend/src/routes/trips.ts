import { Router } from "express";
import { prisma } from "../prisma";
import { optionalAuth } from "../middleware/auth";
import { tripViewLimiter } from "../middleware/rateLimit";
import { buildItinerary } from "../lib/itinerary";
import { joinTripLive, redeemTicket } from "../lib/tripLive";

const router = Router();

// The invite link's landing page: whose trip it is, before joining
// (POST /api/me/trips/join/:token).
router.get("/invite/:token", tripViewLimiter, async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { inviteToken: req.params.token },
    select: {
      name: true,
      startDate: true,
      user: { select: { name: true } },
      items: { orderBy: { position: "asc" }, take: 1, select: { reel: { select: { videoUrl: true } } } },
      _count: { select: { items: true, members: true } },
    },
  });
  if (!trip) return res.status(404).json({ error: "招待リンクが無効です" });
  res.json({
    tripName: trip.name,
    startDate: trip.startDate,
    ownerName: trip.user.name,
    count: trip._count.items,
    people: trip._count.members + 1,
    coverVideoUrl: trip.items[0]?.reel.videoUrl ?? null,
  });
});

// 共同編集のライブ stream for a trip's しおり (see lib/tripLive.ts), opened
// with a one-time ticket from POST /api/me/trips/:id/live-ticket.
router.get("/live/:ticket", (req, res) => {
  const entry = redeemTicket(req.params.ticket);
  if (!entry) return res.status(404).json({ error: "チケットが無効です" });
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");
  if (!joinTripLive(entry.tripId, entry.userId, entry.name, res, (fn) => req.on("close", fn))) {
    res.write("event: busy\ndata: 0\n\n");
    res.end();
  }
});

// A しおり someone shared (POST /reels/itinerary/share): read-only, without
// their trip origin. Signed-in viewers also get which stops they've already
// saved, so the page can offer "add to my しおり".
router.get("/:token", tripViewLimiter, optionalAuth, async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { shareToken: req.params.token },
    select: { id: true, userId: true, user: { select: { name: true } } },
  });
  if (!trip) return res.status(404).json({ error: "このしおりは共有が停止されたか、見つかりません" });
  const owner = { id: trip.userId, name: trip.user.name };

  const itinerary = await buildItinerary(trip.id, { withOrigin: false });
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
    tripName: itinerary.trip.name,
    startDate: itinerary.trip.startDate,
    isMine: req.auth?.userId === owner.id,
    startTime: itinerary.startTime,
    stops: itinerary.stops,
    legs: itinerary.legs,
    savedIds,
  });
});

export default router;
