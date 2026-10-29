import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { conciergeLimiter } from "../middleware/rateLimit";
import { buildItinerary } from "../lib/itinerary";
import { syncSaved, addToTrip } from "../lib/trips";
import { planTrip } from "../services/tripPlanner";

// 旅 (trips) of the signed-in traveler: made first, then filled by choosing
// them when bookmarking a post; each is its own しおり (see the Trip model).
const router = Router();
router.use(requireAuth);

const MAX_TRIPS = 100;

// The trip if it's the signed-in user's, else null (answered as 404).
function ownTrip(userId: string, tripId: string) {
  return prisma.trip.findFirst({ where: { id: tripId, userId } });
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const nameField = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(40));

// Newest-touched first, with a cover clip and count. ?reel=<id> also says
// which trips already contain that post (for the "どの旅に入れる？" sheet).
router.get("/", async (req, res) => {
  const reelId = typeof req.query.reel === "string" ? req.query.reel : null;
  const trips = await prisma.trip.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      items: { orderBy: { position: "asc" }, take: 1, include: { reel: { select: { videoUrl: true } } } },
      _count: { select: { items: true } },
    },
  });
  const containing = reelId
    ? new Set(
        (await prisma.tripItem.findMany({ where: { reelId, trip: { userId: req.auth!.userId } }, select: { tripId: true } })).map(
          (i) => i.tripId
        )
      )
    : null;
  res.json({
    items: trips.map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      count: t._count.items,
      coverVideoUrl: t.items[0]?.reel.videoUrl ?? null,
      updatedAt: t.updatedAt,
      ...(containing ? { containsReel: containing.has(t.id) } : {}),
    })),
  });
});

const createSchema = z.object({ name: nameField, startDate: dateField.optional() });

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "旅の名前を入力してください（40文字まで）" });
  if ((await prisma.trip.count({ where: { userId: req.auth!.userId } })) >= MAX_TRIPS) {
    return res.status(400).json({ error: `旅は${MAX_TRIPS}個まで作れます` });
  }
  const trip = await prisma.trip.create({
    data: { userId: req.auth!.userId, name: parsed.data.name, startDate: parsed.data.startDate ?? null },
  });
  res.status(201).json({ id: trip.id, name: trip.name, startDate: trip.startDate, count: 0, coverVideoUrl: null, updatedAt: trip.updatedAt });
});

const updateSchema = z.object({
  name: nameField.optional(),
  startDate: dateField.optional(),
  originLabel: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(100))
    .optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  if (!(await ownTrip(req.auth!.userId, req.params.id))) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.trip.update({ where: { id: req.params.id }, data: parsed.data });
  res.status(204).end();
});

// Deleting a trip un-bookmarks posts that were only in it.
router.delete("/:id", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  const reelIds = (await prisma.tripItem.findMany({ where: { tripId: trip.id }, select: { reelId: true } })).map((i) => i.reelId);
  await prisma.trip.delete({ where: { id: trip.id } });
  await syncSaved(req.auth!.userId, reelIds);
  res.status(204).end();
});

// Put a post into this trip (at the end) / take it out.
router.put("/:id/items/:reelId", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  const reel = await prisma.reel.findUnique({ where: { id: req.params.reelId }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  await addToTrip(req.auth!.userId, trip.id, reel.id);
  res.status(204).end();
});

router.delete("/:id/items/:reelId", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.tripItem.deleteMany({ where: { tripId: trip.id, reelId: req.params.reelId } });
  await prisma.trip.update({ where: { id: trip.id }, data: { updatedAt: new Date() } });
  await syncSaved(req.auth!.userId, [req.params.reelId]);
  res.status(204).end();
});

const stayMinutesSchema = z.object({ stayMinutes: z.coerce.number().int().min(0).max(24 * 60) });

// Planned stay at one stop of this trip.
router.patch("/:id/items/:reelId", async (req, res) => {
  const parsed = stayMinutesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  if (!(await ownTrip(req.auth!.userId, req.params.id))) return res.status(404).json({ error: "旅が見つかりません" });
  const { count } = await prisma.tripItem.updateMany({
    where: { tripId: req.params.id, reelId: req.params.reelId },
    data: { stayMinutes: parsed.data.stayMinutes },
  });
  if (count === 0) return res.status(404).json({ error: "この旅に入っていない投稿です" });
  res.status(204).end();
});

const orderSchema = z.object({ reelIds: z.array(z.string()).max(200) });

// Rearrange the trip: positions follow the given order. Ids not in the trip
// are ignored rather than rejected, so a stale client list can't fail.
router.put("/:id/order", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  if (!(await ownTrip(req.auth!.userId, req.params.id))) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.$transaction([
    ...parsed.data.reelIds.map((reelId, position) =>
      prisma.tripItem.updateMany({ where: { tripId: req.params.id, reelId }, data: { position } })
    ),
    prisma.trip.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } }),
  ]);
  res.status(204).end();
});

// The trip's しおり — see lib/itinerary.ts.
router.get("/:id/itinerary", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  res.json({ ...(await buildItinerary(trip.id, { withOrigin: true })), shareToken: trip.shareToken });
});

// Share the trip as a read-only link (GET /api/trips/:token). Reuses the
// existing token so a link already sent to companions keeps working.
router.post("/:id/share", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  const token = trip.shareToken ?? randomBytes(12).toString("base64url");
  if (!trip.shareToken) await prisma.trip.update({ where: { id: trip.id }, data: { shareToken: token } });
  res.json({ token });
});

// Stop sharing: the old link stops working immediately.
router.delete("/:id/share", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.trip.update({ where: { id: trip.id }, data: { shareToken: null } });
  res.status(204).end();
});

// "AIでプランを作る": a proposed order and stay times for this trip (see
// services/tripPlanner). Only proposes — the client applies it with the
// order and stay-time endpoints if the traveler accepts.
const planSchema = z.object({
  wishes: z.string().trim().max(300).default(""),
  lang: z.enum(["ja", "en", "zh", "ko"]).default("ja"),
});

router.post("/:id/plan", conciergeLimiter, async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });

  const items = await prisma.tripItem.findMany({
    where: { tripId: trip.id, reel: { locationLat: { not: null }, locationLng: { not: null } } },
    include: { reel: { include: { municipality: { select: { name: true } } } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (items.length < 2) return res.status(400).json({ error: "しおりに2か所以上入れると、プランを作れます" });

  const plan = await planTrip(
    items.map((s) => ({
      id: s.reelId,
      name: s.reel.locationName || s.reel.caption.slice(0, 30),
      municipality: s.reel.municipality.name,
      category: s.reel.category,
      caption: s.reel.caption,
      lat: s.reel.locationLat,
      lng: s.reel.locationLng,
      stayMinutes: s.stayMinutes,
    })),
    parsed.data.wishes,
    trip.startTime,
    parsed.data.lang
  );
  res.json(plan);
});

export default router;
