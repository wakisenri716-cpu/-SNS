import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { staySearchLimiter } from "../middleware/rateLimit";
import { ttlCache } from "../lib/ttlCache";
import { RakutenError, isRakutenConfigured, searchVacantHotels, type StayHotel } from "../services/rakutenTravel";
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
  if (q.reelId) {
    const reel = await prisma.reel.findUnique({ where: { id: q.reelId }, select: { locationName: true, locationLat: true, locationLng: true, municipality: { select: { name: true, prefecture: true } } } });
    if (!reel) return res.status(404).json({ error: "場所が見つかりません" });
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
    const items = await cache.get(key, () => searchVacantHotels({ ...point!, radiusKm: 3, checkin: q.checkin, checkout: q.checkout, adults: q.adults }));
    // affiliate: the links earn Jaziba a commission, which the page must say (ステマ規制).
    res.json({ configured: true, located: true, provider: "rakuten", affiliate: !!process.env.RAKUTEN_AFFILIATE_ID, items, mapSearchUrl, nights });
  } catch (err) {
    console.error("[stays]", err instanceof RakutenError ? err.message : err);
    res.status(502).json({ error: "いまは宿の空室を調べられません。少し時間をおいてお試しください", mapSearchUrl });
  }
});

export default router;
