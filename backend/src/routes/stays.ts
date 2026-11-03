import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { staySearchLimiter } from "../middleware/rateLimit";
import { ttlCache } from "../lib/ttlCache";
import { RakutenError, hotelsNear, isRakutenConfigured, rakutenAffiliateId, searchVacantHotels, type StayHotel } from "../services/rakutenTravel";
import { requireAuth } from "../middleware/auth";
import { isAdminEmail } from "../lib/admin";
import { matchHotel } from "../lib/hotelMatch";
import { todayInJapan } from "./events";

// 宿を探す・予約: rooms free on the traveler's dates near a spot or a town,
// with prices, from 楽天トラベル; booking happens there. Without the 楽天 keys
// the app offers a map search instead (configured: false).
const router = Router();

const DAY = 86_400_000;
const schema = z
  .object({
    reelId: z.string().max(40).optional(),
    municipalityId: z.string().max(40).optional(),
    lat: z.coerce.number().min(20).max(46).optional(),
    lng: z.coerce.number().min(122).max(154).optional(),
    checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    adults: z.coerce.number().int().min(1).max(10).default(2),
  })
  .refine((q) => q.reelId || q.municipalityId || (q.lat != null && q.lng != null), "where");

const cache = ttlCache<StayHotel[]>(10 * 60 * 1000, 300);

router.get("/", staySearchLimiter, async (req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "日付と人数を確認してください" });
  const q = parsed.data;
  const nights = Math.round((Date.parse(q.checkout) - Date.parse(q.checkin)) / DAY);
  if (q.checkin < todayInJapan()) return res.status(400).json({ error: "チェックインは今日以降の日付にしてください" });
  if (!(nights >= 1 && nights <= 14)) return res.status(400).json({ error: "泊数は1〜14泊にしてください" });

  // Where: the spot, the town's station / office, or a point.
  let place = "";
  let point: { lat: number; lng: number } | null = null;
  let linkedHotelNo: number | null = null;
  if (q.reelId) {
    const reel = await prisma.reel.findUnique({ where: { id: q.reelId }, select: { locationName: true, locationLat: true, locationLng: true, rakutenHotelNo: true, municipality: { select: { name: true, prefecture: true } } } });
    if (!reel) return res.status(404).json({ error: "場所が見つかりません" });
    linkedHotelNo = reel.rakutenHotelNo;
    place = `${reel.municipality.prefecture}${reel.municipality.name} ${reel.locationName ?? ""}`.trim();
    if (reel.locationLat != null && reel.locationLng != null) point = { lat: reel.locationLat, lng: reel.locationLng };
  } else if (q.municipalityId) {
    const m = await prisma.municipality.findUnique({ where: { id: q.municipalityId }, select: { name: true, prefecture: true, nearestStationLat: true, nearestStationLng: true, officeLat: true, officeLng: true } });
    if (!m) return res.status(404).json({ error: "場所が見つかりません" });
    place = `${m.prefecture}${m.name}`;
    const lat = m.nearestStationLat ?? m.officeLat;
    const lng = m.nearestStationLng ?? m.officeLng;
    if (lat != null && lng != null) point = { lat, lng };
  } else {
    point = { lat: q.lat!, lng: q.lng! };
  }
  // Without the 楽天 keys (or a position): a map search for places to stay there.
  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`宿泊 ${place}`.trim())}`;
  if (!isRakutenConfigured() || !point) return res.json({ configured: isRakutenConfigured(), located: !!point, items: [], mapSearchUrl, nights });

  try {
    const key = [point.lat.toFixed(4), point.lng.toFixed(4), q.checkin, q.checkout, q.adults].join(":");
    const near = await cache.get(key, () => searchVacantHotels({ ...point!, radiusKm: 3, checkin: q.checkin, checkout: q.checkout, adults: q.adults }));
    // A lodging post's own hotel first (asked for by number if it isn't among them).
    let items = near;
    if (linkedHotelNo != null) {
      const own =
        near.find((h) => h.id === linkedHotelNo) ??
        (await cache.get(`hotel:${linkedHotelNo}:${q.checkin}:${q.checkout}:${q.adults}`, () =>
          searchVacantHotels({ ...point!, radiusKm: 3, checkin: q.checkin, checkout: q.checkout, adults: q.adults, hotelNos: [linkedHotelNo!] })
        ))[0];
      items = own ? [own, ...near.filter((h) => h.id !== linkedHotelNo)] : near;
    }
    // affiliate: the links earn Jaziba a commission, which the page must say (ステマ規制).
    res.json({ configured: true, located: true, provider: "rakuten", affiliate: !!rakutenAffiliateId(), items, linkedHotelNo, mapSearchUrl, nights });
  } catch (err) {
    console.error("[stays]", err instanceof RakutenError ? err.message : err);
    res.status(502).json({ error: "いまは宿の空室を調べられません。少し時間をおいてお試しください", mapSearchUrl });
  }
});

// ---- A post's hotels ------------------------------------------------------------

const reelSelect = {
  id: true,
  category: true,
  locationName: true,
  locationLat: true,
  locationLng: true,
  rakutenHotelNo: true,
  rakutenHotelName: true,
  rakutenCheckedAt: true,
  municipalityId: true,
  companyId: true,
  municipality: { select: { userId: true, name: true, prefecture: true } },
  company: { select: { userId: true } },
} as const;
type ReelForStay = NonNullable<Awaited<ReturnType<typeof prisma.reel.findUnique<{ where: { id: string }; select: typeof reelSelect }>>>>;

const nearCache = ttlCache<StayHotel[]>(6 * 60 * 60 * 1000, 500);
const RECHECK_MS = 7 * DAY;

/**
 * A lodging post with no hotel yet: look for the 楽天トラベル hotel of the same
 * name right there, and remember it (or that none was found, for a week).
 */
async function autoLink(reel: ReelForStay): Promise<ReelForStay> {
  if (reel.category !== "lodging" || reel.rakutenHotelNo != null || !reel.locationName || reel.locationLat == null || reel.locationLng == null) return reel;
  if (reel.rakutenCheckedAt && Date.now() - reel.rakutenCheckedAt.getTime() < RECHECK_MS) return reel;
  const candidates = await hotelsNear(reel.locationLat, reel.locationLng, 0.6, 30);
  const hit = matchHotel({ name: reel.locationName, lat: reel.locationLat, lng: reel.locationLng }, candidates);
  const data = { rakutenCheckedAt: new Date(), ...(hit ? { rakutenHotelNo: hit.id, rakutenHotelName: hit.name } : {}) };
  await prisma.reel.update({ where: { id: reel.id }, data });
  return { ...reel, ...data };
}

// 近くの宿 on a post: the real hotels around it (from 楽天トラベル, no dates
// needed), the post's own hotel first when it is one.
router.get("/near/:reelId", staySearchLimiter, async (req, res) => {
  let reel = await prisma.reel.findUnique({ where: { id: req.params.reelId }, select: reelSelect });
  if (!reel) return res.status(404).json({ error: "場所が見つかりません" });
  const place = `${reel.municipality.prefecture}${reel.municipality.name} ${reel.locationName ?? ""}`.trim();
  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`宿泊 ${place}`)}`;
  if (!isRakutenConfigured() || reel.locationLat == null || reel.locationLng == null) {
    return res.json({ configured: isRakutenConfigured(), linked: null, hotels: [], mapSearchUrl });
  }
  try {
    reel = await autoLink(reel);
    const { locationLat: lat, locationLng: lng } = reel;
    const hotels = await nearCache.get(`${lat!.toFixed(4)}:${lng!.toFixed(4)}`, () => hotelsNear(lat!, lng!, 2, 10));
    const linkedNo = reel.rakutenHotelNo;
    const ordered = linkedNo != null ? [...hotels.filter((h) => h.id === linkedNo), ...hotels.filter((h) => h.id !== linkedNo)] : hotels;
    res.json({
      configured: true,
      affiliate: !!rakutenAffiliateId(),
      linked: linkedNo != null ? { no: linkedNo, name: reel.rakutenHotelName } : null,
      hotels: ordered.slice(0, 6),
      mapSearchUrl,
    });
  } catch (err) {
    console.error("[stays.near]", err instanceof RakutenError ? err.message : err);
    res.status(502).json({ error: "いまは宿を調べられません。少し時間をおいてお試しください", mapSearchUrl });
  }
});

/** The post's own municipality or business, or an admin. */
async function canLink(req: Parameters<typeof requireAuth>[0], reel: ReelForStay) {
  const userId = req.auth?.userId;
  if (!userId) return false;
  if (reel.companyId ? reel.company?.userId === userId : reel.municipality.userId === userId) return true;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return !!me && isAdminEmail(me.email);
}

// For the post's editor: hotels within 1 km to choose from.
router.get("/candidates/:reelId", requireAuth, staySearchLimiter, async (req, res) => {
  const reel = await prisma.reel.findUnique({ where: { id: req.params.reelId }, select: reelSelect });
  if (!reel || !(await canLink(req, reel))) return res.status(404).json({ error: "投稿が見つかりません" });
  if (!isRakutenConfigured()) return res.json({ configured: false, hotels: [] });
  if (reel.locationLat == null || reel.locationLng == null) return res.json({ configured: true, hotels: [] });
  try {
    res.json({ configured: true, hotels: await hotelsNear(reel.locationLat, reel.locationLng, 1, 30) });
  } catch (err) {
    console.error("[stays.candidates]", err instanceof RakutenError ? err.message : err);
    res.status(502).json({ error: "いまは宿を調べられません" });
  }
});

// Link (or unlink) the post to a 楽天トラベル hotel.
router.put("/link/:reelId", requireAuth, async (req, res) => {
  const parsed = z.object({ hotelNo: z.number().int().positive().nullable(), name: z.string().trim().max(120).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "宿を選んでください" });
  const reel = await prisma.reel.findUnique({ where: { id: req.params.reelId }, select: reelSelect });
  if (!reel || !(await canLink(req, reel))) return res.status(404).json({ error: "投稿が見つかりません" });
  await prisma.reel.update({
    where: { id: reel.id },
    data: { rakutenHotelNo: parsed.data.hotelNo, rakutenHotelName: parsed.data.hotelNo ? parsed.data.name : "", rakutenCheckedAt: new Date() },
  });
  res.json({ rakutenHotel: parsed.data.hotelNo ? { no: parsed.data.hotelNo, name: parsed.data.name } : null });
});

export default router;
