import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { placeSearchLimiter } from "../middleware/rateLimit";
import { builtInCandidates, normalizePlace } from "../services/placeLookup";
import { OsmBusyError, searchOsm, setOsmSiteOrigin } from "../services/osmSearch";
import { haversineMeters } from "../services/googleMaps";

// 場所を選ぶ (posting): find a place by name and get its position, so a post
// lands on the map without typing coordinates. Jaziba's own places (sights,
// places already posted, stations, municipalities) answer as you type;
// with osm=1 (the 検索 button) every named place on the map is searched too
// (OpenStreetMap, services/osmSearch.ts).
const router = Router();
router.use((req, _res, next) => {
  setOsmSiteOrigin(`${req.protocol}://${req.get("host")}`);
  next();
});

export type PlaceSource = "spot" | "post" | "station" | "municipality" | "osm";
export interface PlaceResult {
  name: string;
  detail: string;
  lat: number;
  lng: number;
  source: PlaceSource;
  type?: string;
}

const schema = z.object({
  q: z.string().trim().min(1).max(100),
  lat: z.coerce.number().min(20).max(46).optional(),
  lng: z.coerce.number().min(122).max(154).optional(),
  osm: z.enum(["0", "1"]).optional(),
});

const key = (p: { name: string; lat: number; lng: number }) => `${normalizePlace(p.name)}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;

// Where the picker's map starts and searches lean towards: the given
// municipality (a traveler offering photos to it), else the poster's own
// (a municipality, or a business's town) — its station, else its office.
router.get("/home", requireAuth, async (req, res) => {
  const select = { name: true, prefecture: true, nearestStationLat: true, nearestStationLng: true, officeLat: true, officeLng: true } as const;
  const id = typeof req.query.municipalityId === "string" ? req.query.municipalityId.slice(0, 40) : "";
  const m = id
    ? await prisma.municipality.findUnique({ where: { id }, select })
    : ((await prisma.municipality.findUnique({ where: { userId: req.auth!.userId }, select })) ??
      (await prisma.company.findUnique({ where: { userId: req.auth!.userId }, select: { municipality: { select } } }))?.municipality ??
      null);
  const lat = m?.nearestStationLat ?? m?.officeLat ?? null;
  const lng = m?.nearestStationLat != null ? m.nearestStationLng : (m?.officeLng ?? null);
  res.json(m && lat != null && lng != null ? { name: `${m.prefecture}${m.name}`, lat, lng } : null);
});

// Only the OpenStreetMap searches count against the limit.
const limitOsm: RequestHandler = (req, res, next) => (req.query.osm === "1" ? placeSearchLimiter(req, res, next) : next());

router.get("/search", requireAuth, limitOsm, async (req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "場所の名前を入れてください" });
  const { q, lat, lng } = parsed.data;
  const near = lat != null && lng != null ? { lat, lng } : undefined;
  const text = q.normalize("NFKC").trim();

  const [spots, posts] = await Promise.all([
    prisma.tourismSpot.findMany({
      where: { name: { contains: text }, locationLat: { not: null }, locationLng: { not: null } },
      select: { name: true, locationLat: true, locationLng: true, municipality: { select: { name: true, prefecture: true } } },
      take: 20,
    }),
    prisma.reel.findMany({
      where: { locationName: { contains: text }, locationLat: { not: null }, locationLng: { not: null } },
      select: { locationName: true, locationLat: true, locationLng: true, municipality: { select: { name: true, prefecture: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  const own: PlaceResult[] = [
    ...spots.map((s) => ({ name: s.name, detail: `${s.municipality.prefecture}${s.municipality.name}`, lat: s.locationLat!, lng: s.locationLng!, source: "spot" as const })),
    ...posts.map((r) => ({ name: r.locationName!, detail: r.municipality ? `${r.municipality.prefecture}${r.municipality.name}` : "", lat: r.locationLat!, lng: r.locationLng!, source: "post" as const })),
    ...builtInCandidates(text, 8).map((p) => ({ name: p.name, detail: p.detail, lat: p.lat, lng: p.lng, source: p.kind })),
  ];

  // Exact names first, then names starting with the text, then nearest.
  const rank = (p: PlaceResult) => {
    const n = normalizePlace(p.name);
    const t = normalizePlace(text);
    return n === t || n === `${t}駅` ? 0 : n.startsWith(t) ? 1 : 2;
  };
  const dist = (p: PlaceResult) => (near ? haversineMeters(near, p) : 0);
  const seen = new Set<string>();
  const items = own
    .sort((a, b) => rank(a) - rank(b) || dist(a) - dist(b))
    .filter((p) => (seen.has(key(p)) ? false : (seen.add(key(p)), true)))
    .slice(0, 12);

  if (parsed.data.osm !== "1") return res.json({ items, osm: false });

  // The 検索 button: every named place on the map (OpenStreetMap).
  try {
    const found = await searchOsm(text, near);
    const osm = found
      .map((p) => ({ ...p, source: "osm" as const }))
      .filter((p) => (seen.has(key(p)) ? false : (seen.add(key(p)), true)));
    res.json({ items: [...items, ...osm], osm: true });
  } catch (err) {
    if (!(err instanceof OsmBusyError)) console.error("[places] OpenStreetMap search failed:", err);
    res.json({ items, osm: true, osmError: err instanceof OsmBusyError ? "busy" : "failed" });
  }
});

export default router;
