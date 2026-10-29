import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { tripsOf } from "../lib/trips";

// 旅の振り返り: the traveler's year on Jaziba — places saved into trips,
// stamps collected on site, prefectures, the month they were busiest, their
// favourite kind of place. Counted only from their own activity; nothing
// is estimated.
const router = Router();
router.use(requireAuth);

const querySchema = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() });

// Japan time: the year runs from Jan 1 00:00 JST.
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstMonth = (d: Date) => new Date(d.getTime() + JST_OFFSET_MS).getUTCMonth();
const jstYear = (d: Date) => new Date(d.getTime() + JST_OFFSET_MS).getUTCFullYear();

function topOf(counts: Map<string, number>) {
  let best: [string, number] | null = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best;
}

router.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "年を確認してください" });
  const userId = req.auth!.userId;
  const year = parsed.data.year ?? jstYear(new Date());
  const range = {
    gte: new Date(Date.UTC(year, 0, 1) - JST_OFFSET_MS),
    lt: new Date(Date.UTC(year + 1, 0, 1) - JST_OFFSET_MS),
  };
  const reelSelect = {
    id: true,
    category: true,
    locationName: true,
    videoUrl: true,
    thumbnailUrl: true,
    municipality: { select: { id: true, name: true, prefecture: true } },
  } as const;

  const [items, visits, likes, comments, follows, tripsMade] = await Promise.all([
    prisma.tripItem.findMany({
      where: { createdAt: range, trip: tripsOf(userId) },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, reel: { select: reelSelect } },
    }),
    prisma.visit.findMany({ where: { userId, createdAt: range }, orderBy: { createdAt: "asc" }, select: { createdAt: true, reel: { select: reelSelect } } }),
    prisma.like.findMany({ where: { userId, createdAt: range }, select: { createdAt: true } }),
    prisma.comment.count({ where: { userId, createdAt: range } }),
    prisma.follow.count({ where: { followerId: userId, createdAt: range } }),
    prisma.trip.findMany({
      where: { userId, createdAt: range },
      select: { id: true, name: true, _count: { select: { items: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Each post once, even if it went into several trips.
  const saved = [...new Map(items.map((i) => [i.reel.id, i])).values()];
  const categories = new Map<string, number>();
  const municipalities = new Map<string, number>();
  const muniNames = new Map<string, { name: string; prefecture: string }>();
  for (const { reel } of [...saved, ...visits]) {
    categories.set(reel.category, (categories.get(reel.category) ?? 0) + 1);
    municipalities.set(reel.municipality.id, (municipalities.get(reel.municipality.id) ?? 0) + 1);
    muniNames.set(reel.municipality.id, reel.municipality);
  }
  const months = Array.from({ length: 12 }, () => 0);
  for (const { createdAt } of [...items, ...visits, ...likes]) months[jstMonth(createdAt)] += 1;
  const busiest = months.some((n) => n > 0) ? months.indexOf(Math.max(...months)) + 1 : null;
  const topCategory = topOf(categories);
  const topMuni = topOf(municipalities);
  const place = (r: (typeof saved)[number]["reel"], at: Date) => ({
    id: r.id,
    name: r.locationName || r.municipality.name,
    prefecture: r.municipality.prefecture,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    at,
  });

  res.json({
    year,
    saved: {
      count: saved.length,
      prefectures: [...new Set(saved.map((i) => i.reel.municipality.prefecture))],
      first: saved[0] ? place(saved[0].reel, saved[0].createdAt) : null,
      places: saved.slice(-6).reverse().map((i) => place(i.reel, i.createdAt)),
    },
    stamps: {
      count: visits.length,
      prefectures: [...new Set(visits.map((v) => v.reel.municipality.prefecture))],
      places: visits.slice(-6).reverse().map((v) => place(v.reel, v.createdAt)),
    },
    trips: {
      count: tripsMade.length,
      biggest: tripsMade.length ? [...tripsMade].sort((a, b) => b._count.items - a._count.items)[0] : null,
    },
    likes: likes.length,
    comments,
    follows,
    months,
    busiestMonth: busiest,
    topCategory: topCategory ? { category: topCategory[0], count: topCategory[1] } : null,
    topMunicipality: topMuni ? { ...muniNames.get(topMuni[0])!, id: topMuni[0], count: topMuni[1] } : null,
  });
});

export default router;
