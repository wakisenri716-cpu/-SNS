import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { haversineMeters } from "../services/googleMaps";
import { forecastAt } from "../services/weather";
import { weatherLimiter } from "../middleware/rateLimit";

// 天気予報 for a しおり (own or shared): each day's forecast at that day's
// first stop, and — for a wet day — indoor posts near it to swap in.
const router = Router();

const pointsSchema = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .min(1)
    .max(14),
});

router.post("/", weatherLimiter, async (req, res) => {
  const parsed = pointsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const days = await Promise.all(parsed.data.points.map((p) => forecastAt(p.lat, p.lng, p.date)));
  res.json({ source: "Open-Meteo", days });
});

// Words in a caption or place name that suggest the visit is indoors.
const INDOOR_WORDS = [
  "美術館", "博物館", "資料館", "記念館", "水族館", "科学館", "文学館", "ミュージアム", "ギャラリー", "屋内", "館内",
  "温泉", "工房", "体験教室", "酒蔵", "醸造", "ワイナリー", "カフェ", "喫茶", "museum", "aquarium", "gallery", "indoor",
];
const NEAR_KM = 25;
const MAX_OPTIONS = 3;

const indoorSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  exclude: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => new Set((v ?? "").split(",").filter(Boolean))),
});

// Restaurants, and posts whose own text names an indoor kind of place, within
// 25 km — each with why it was picked, so the UI never guesses.
router.get("/indoor", weatherLimiter, async (req, res) => {
  const parsed = indoorSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const { lat, lng, exclude } = parsed.data;
  const reels = await prisma.reel.findMany({
    where: { locationLat: { not: null }, locationLng: { not: null } },
    take: 300,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      caption: true,
      category: true,
      locationName: true,
      locationLat: true,
      locationLng: true,
      videoUrl: true,
      thumbnailUrl: true,
      municipality: { select: { name: true, prefecture: true } },
    },
  });
  const items = reels
    .filter((r) => !exclude.has(r.id))
    .map((r) => {
      const text = `${r.locationName ?? ""} ${r.caption}`.toLowerCase();
      const word = INDOOR_WORDS.find((w) => text.includes(w.toLowerCase())) ?? null;
      const km = haversineMeters({ lat, lng }, { lat: r.locationLat!, lng: r.locationLng! }) / 1000;
      return { r, km, why: { restaurant: r.category === "restaurant", word } };
    })
    .filter((x) => x.km <= NEAR_KM && (x.why.restaurant || x.why.word))
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_OPTIONS)
    .map(({ r, km, why }) => ({
      km: Math.round(km * 100) / 100,
      why,
      reel: {
        id: r.id,
        videoUrl: r.videoUrl,
        thumbnailUrl: r.thumbnailUrl,
        category: r.category,
        locationName: r.locationName,
        municipality: r.municipality,
      },
    }));
  res.json({ items });
});

export default router;
