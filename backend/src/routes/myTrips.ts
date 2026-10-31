import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { conciergeLimiter } from "../middleware/rateLimit";
import { buildItinerary } from "../lib/itinerary";
import { accessibleTrip, addToTrip, syncSavedForTrip, syncSavedForUsers, tripParticipants, tripsOf } from "../lib/trips";
import { issueTicket, shareLocation, stopSharingLocation, tripChanged } from "../lib/tripLive";
import { planTrip } from "../services/tripPlanner";
import { serializeTransport } from "../lib/tripTransports";
import { composeTrip } from "../services/tripComposer";
import { parseBestMonths, parseTravelerTags } from "../types";
import { REEL_ORDER } from "../lib/reelSerializer";

// 旅 (trips) of the signed-in traveler: made first, then filled by choosing
// them when bookmarking a post; each is its own しおり (see the Trip model).
// Companions who joined with the invite link edit it too; only the owner
// deletes it or manages its links and members.
const router = Router();
router.use(requireAuth);

const MAX_TRIPS = 100;

// The trip if it's the signed-in user's own, else null (answered as 404).
function ownTrip(userId: string, tripId: string) {
  return prisma.trip.findFirst({ where: { id: tripId, userId } });
}

async function actor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  return user ?? { id: userId, name: "" };
}

// After an edit: tell the others with this しおり open (they reload).
async function changed(tripId: string, userId: string) {
  tripChanged(tripId, await actor(userId));
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
    where: tripsOf(req.auth!.userId),
    orderBy: { updatedAt: "desc" },
    include: {
      items: { orderBy: { position: "asc" }, take: 1, include: { reel: { select: { videoUrl: true } } } },
      user: { select: { name: true } },
      _count: { select: { items: true, members: true } },
    },
  });
  const containing = reelId
    ? new Set(
        (await prisma.tripItem.findMany({ where: { reelId, trip: tripsOf(req.auth!.userId) }, select: { tripId: true } })).map(
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
      // Joined trips say whose they are; members counts everyone planning it.
      isOwner: t.userId === req.auth!.userId,
      ownerName: t.user.name,
      people: t._count.members + 1,
      ...(containing ? { containsReel: containing.has(t.id) } : {}),
    })),
  });
});

// `items` fills the new trip in one go (used by "AIで旅をつくる").
const createSchema = z.object({
  name: nameField,
  startDate: dateField.optional(),
  items: z
    .array(z.object({ reelId: z.string().max(40), stayMinutes: z.coerce.number().int().min(0).max(24 * 60).default(60) }))
    .max(30)
    .default([]),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "旅の名前を入力してください（40文字まで）" });
  if ((await prisma.trip.count({ where: { userId: req.auth!.userId } })) >= MAX_TRIPS) {
    return res.status(400).json({ error: `旅は${MAX_TRIPS}個まで作れます` });
  }
  // Unknown or repeated posts are skipped rather than failing the whole trip.
  const existing = new Set(
    (await prisma.reel.findMany({ where: { id: { in: parsed.data.items.map((i) => i.reelId) } }, select: { id: true } })).map((r) => r.id)
  );
  const seen = new Set<string>();
  const items = parsed.data.items.filter((i) => existing.has(i.reelId) && !seen.has(i.reelId) && seen.add(i.reelId));
  const trip = await prisma.trip.create({
    data: {
      userId: req.auth!.userId,
      name: parsed.data.name,
      startDate: parsed.data.startDate ?? null,
      items: { create: items.map((i, position) => ({ reelId: i.reelId, stayMinutes: i.stayMinutes, position })) },
    },
  });
  await syncSavedForTrip(trip.id, items.map((i) => i.reelId));
  const cover = items[0] ? await prisma.reel.findUnique({ where: { id: items[0].reelId }, select: { videoUrl: true } }) : null;
  res.status(201).json({
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    count: items.length,
    coverVideoUrl: cover?.videoUrl ?? null,
    updatedAt: trip.updatedAt,
    isOwner: true,
    ownerName: (await actor(req.auth!.userId)).name,
    people: 1,
  });
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
  if (!(await accessibleTrip(req.auth!.userId, req.params.id))) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.trip.update({ where: { id: req.params.id }, data: parsed.data });
  await changed(req.params.id, req.auth!.userId);
  res.status(204).end();
});

// Deleting a trip un-bookmarks posts that were only in it.
router.delete("/:id", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  const reelIds = (await prisma.tripItem.findMany({ where: { tripId: trip.id }, select: { reelId: true } })).map((i) => i.reelId);
  const people = await tripParticipants(trip.id);
  await prisma.trip.delete({ where: { id: trip.id } });
  await syncSavedForUsers(people, reelIds);
  res.status(204).end();
});

// Put a post into this trip (at the end) / take it out.
router.put("/:id/items/:reelId", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  const reel = await prisma.reel.findUnique({ where: { id: req.params.reelId }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  await addToTrip(req.auth!.userId, access.trip.id, reel.id);
  await changed(access.trip.id, req.auth!.userId);
  res.status(204).end();
});

router.delete("/:id/items/:reelId", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.tripItem.deleteMany({ where: { tripId: access.trip.id, reelId: req.params.reelId } });
  await prisma.trip.update({ where: { id: access.trip.id }, data: { updatedAt: new Date() } });
  await syncSavedForTrip(access.trip.id, [req.params.reelId]);
  await changed(access.trip.id, req.auth!.userId);
  res.status(204).end();
});

const stayMinutesSchema = z.object({ stayMinutes: z.coerce.number().int().min(0).max(24 * 60) });

// Planned stay at one stop of this trip.
router.patch("/:id/items/:reelId", async (req, res) => {
  const parsed = stayMinutesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  if (!(await accessibleTrip(req.auth!.userId, req.params.id))) return res.status(404).json({ error: "旅が見つかりません" });
  const { count } = await prisma.tripItem.updateMany({
    where: { tripId: req.params.id, reelId: req.params.reelId },
    data: { stayMinutes: parsed.data.stayMinutes },
  });
  if (count === 0) return res.status(404).json({ error: "この旅に入っていない投稿です" });
  await changed(req.params.id, req.auth!.userId);
  res.status(204).end();
});

const orderSchema = z.object({ reelIds: z.array(z.string()).max(200) });

// Rearrange the trip: positions follow the given order. Ids not in the trip
// are ignored rather than rejected, so a stale client list can't fail.
router.put("/:id/order", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  if (!(await accessibleTrip(req.auth!.userId, req.params.id))) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.$transaction([
    ...parsed.data.reelIds.map((reelId, position) =>
      prisma.tripItem.updateMany({ where: { tripId: req.params.id, reelId }, data: { position } })
    ),
    prisma.trip.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } }),
  ]);
  await changed(req.params.id, req.auth!.userId);
  res.status(204).end();
});

// The trip's しおり — see lib/itinerary.ts.
// Members see who's planning it; only the owner gets the link tokens.
router.get("/:id/itinerary", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  const { trip, isOwner } = access;
  const people = await prisma.trip.findUniqueOrThrow({
    where: { id: trip.id },
    select: { user: { select: { id: true, name: true } }, members: { orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, name: true } } } } },
  });
  const transports = await prisma.tripTransport.findMany({ where: { tripId: trip.id }, orderBy: { departAt: "asc" } });
  res.json({
    ...(await buildItinerary(trip.id, { withOrigin: true })),
    transports: transports.map((t) => serializeTransport(t, { forMembers: true })),
    isOwner,
    owner: people.user,
    members: people.members.map((m) => m.user),
    shareToken: isOwner ? trip.shareToken : null,
    inviteToken: isOwner ? trip.inviteToken : null,
  });
});

// A one-time ticket for this しおり's live stream (GET /api/trips-live/:ticket).
router.post("/:id/live-ticket", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  const me = await actor(req.auth!.userId);
  res.json({ ticket: issueTicket(access.trip.id, me.id, me.name) });
});

// 乗る便 (see the TripTransport model): flights, trains, buses the travellers
// booked, entered by them. Members edit them like the rest of the しおり.
const MAX_TRANSPORTS = 50;
const text = (max: number) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(max));
const transportSchema = z
  .object({
    kind: z.enum(["plane", "train", "bus", "ferry", "other"]),
    name: text(60).pipe(z.string().min(1)),
    operator: text(60).default(""),
    fromName: text(60).pipe(z.string().min(1)),
    toName: text(60).pipe(z.string().min(1)),
    departAt: z.coerce.date(),
    arriveAt: z.coerce.date(),
    departPlatform: text(30).default(""),
    arrivePlatform: text(30).default(""),
    seat: text(30).default(""),
    confirmation: text(40).default(""),
    note: text(300).default(""),
  })
  .refine((t) => t.arriveAt.getTime() >= t.departAt.getTime() && t.arriveAt.getTime() - t.departAt.getTime() <= 3 * 24 * 3600_000, {
    message: "arrival",
  });

router.post("/:id/transports", async (req, res) => {
  const parsed = transportSchema.safeParse(req.body);
  if (!parsed.success) {
    const arrival = parsed.error.issues.some((i) => i.message === "arrival");
    return res.status(400).json({ error: arrival ? "到着は出発より後（3日以内）にしてください" : "便名・出発地・到着地・時刻を入力してください" });
  }
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  if ((await prisma.tripTransport.count({ where: { tripId: access.trip.id } })) >= MAX_TRANSPORTS) {
    return res.status(400).json({ error: `乗る便は${MAX_TRANSPORTS}件まで登録できます` });
  }
  const created = await prisma.tripTransport.create({ data: { tripId: access.trip.id, ...parsed.data } });
  await changed(access.trip.id, req.auth!.userId);
  res.status(201).json(serializeTransport(created, { forMembers: true }));
});

router.put("/:id/transports/:transportId", async (req, res) => {
  const parsed = transportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  // New times: the お知らせ should go out again for them.
  const before = await prisma.tripTransport.findFirst({ where: { id: req.params.transportId, tripId: access.trip.id }, select: { departAt: true, arriveAt: true } });
  const reset = {
    ...(before && before.departAt.getTime() !== parsed.data.departAt.getTime() ? { departNotifiedAt: null } : {}),
    ...(before && before.arriveAt.getTime() !== parsed.data.arriveAt.getTime() ? { arriveNotifiedAt: null } : {}),
  };
  const { count } = await prisma.tripTransport.updateMany({ where: { id: req.params.transportId, tripId: access.trip.id }, data: { ...parsed.data, ...reset } });
  if (count === 0) return res.status(404).json({ error: "便が見つかりません" });
  await changed(access.trip.id, req.auth!.userId);
  res.status(204).end();
});

router.delete("/:id/transports/:transportId", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  const { count } = await prisma.tripTransport.deleteMany({ where: { id: req.params.transportId, tripId: access.trip.id } });
  if (count === 0) return res.status(404).json({ error: "便が見つかりません" });
  await changed(access.trip.id, req.auth!.userId);
  res.status(204).end();
});

// みんなの現在地: share my position with the others on this trip while I
// have it switched on (see lib/tripLive.ts; memory only, gone after 10 min).
const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).default(0),
});

router.post("/:id/location", async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "位置を確認してください" });
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  const accepted = shareLocation(access.trip.id, await actor(req.auth!.userId), parsed.data);
  res.status(accepted ? 204 : 202).end();
});

router.delete("/:id/location", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  stopSharingLocation(access.trip.id, req.auth!.userId);
  res.status(204).end();
});

// 一緒に計画する: an invite link (/join/:token) to join and edit this trip.
// Reused while it exists; turning it off stops new joins (members stay).
router.post("/:id/invite", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  const token = trip.inviteToken ?? randomBytes(12).toString("base64url");
  if (!trip.inviteToken) await prisma.trip.update({ where: { id: trip.id }, data: { inviteToken: token } });
  res.json({ token });
});

router.delete("/:id/invite", async (req, res) => {
  const trip = await ownTrip(req.auth!.userId, req.params.id);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  await prisma.trip.update({ where: { id: trip.id }, data: { inviteToken: null } });
  res.status(204).end();
});

// Join with an invite link. Joining your own trip, or again, is harmless.
router.post("/join/:token", async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { inviteToken: req.params.token } });
  if (!trip) return res.status(404).json({ error: "招待リンクが無効です" });
  if (trip.userId !== req.auth!.userId) {
    await prisma.tripMember.upsert({
      where: { tripId_userId: { tripId: trip.id, userId: req.auth!.userId } },
      create: { tripId: trip.id, userId: req.auth!.userId },
      update: {},
    });
    const reelIds = (await prisma.tripItem.findMany({ where: { tripId: trip.id }, select: { reelId: true } })).map((i) => i.reelId);
    await syncSavedForUsers([req.auth!.userId], reelIds);
    await changed(trip.id, req.auth!.userId);
  }
  res.json({ tripId: trip.id });
});

// The owner removes a member; a member removes themselves (leaves).
router.delete("/:id/members/:userId", async (req, res) => {
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  if (!access.isOwner && req.params.userId !== req.auth!.userId) return res.status(403).json({ error: "メンバーを外せるのは旅を作った人だけです" });
  await prisma.tripMember.deleteMany({ where: { tripId: access.trip.id, userId: req.params.userId } });
  stopSharingLocation(access.trip.id, req.params.userId);
  const reelIds = (await prisma.tripItem.findMany({ where: { tripId: access.trip.id }, select: { reelId: true } })).map((i) => i.reelId);
  await syncSavedForUsers([req.params.userId], reelIds);
  await changed(access.trip.id, req.auth!.userId);
  res.status(204).end();
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
  const access = await accessibleTrip(req.auth!.userId, req.params.id);
  if (!access) return res.status(404).json({ error: "旅が見つかりません" });
  const { trip } = access;

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

// "AIで旅をつくる": a whole trip proposed from a description ("2泊3日で長野、
// 温泉とお城"), built from posts that have a location (see
// services/tripComposer). Only proposes — POST / with `items` creates it.
const COMPOSE_POOL = 120;
const composeSchema = z.object({
  message: z.string().trim().min(1).max(300),
  lang: z.enum(["ja", "en", "zh", "ko"]).default("ja"),
});

router.post("/compose", conciergeLimiter, async (req, res) => {
  const parsed = composeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "どんな旅にしたいか入力してください（300文字まで）" });
  const reels = await prisma.reel.findMany({
    where: { locationLat: { not: null }, locationLng: { not: null } },
    take: COMPOSE_POOL,
    orderBy: REEL_ORDER,
    include: { municipality: { select: { name: true, prefecture: true } }, company: { select: { name: true } } },
  });
  const result = await composeTrip(
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
      lat: r.locationLat!,
      lng: r.locationLng!,
    }))
  );
  const byId = new Map(reels.map((r) => [r.id, r]));
  res.json({
    ...result,
    stops: result.stops.map((s) => {
      const r = byId.get(s.id)!;
      return {
        ...s,
        reel: {
          id: r.id,
          videoUrl: r.videoUrl,
          category: r.category,
          locationName: r.locationName,
          municipality: { name: r.municipality.name, prefecture: r.municipality.prefecture },
        },
      };
    }),
  });
});

export default router;
