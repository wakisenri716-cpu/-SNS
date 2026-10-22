import { Request, Response, Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { anonymousViewerState, reelInclude, serializeReel, type ReelViewerState } from "../lib/reelSerializer";
import { getFollowedIds } from "../lib/followState";
import { geocode, getRouteEstimate, getStaticMapImage, haversineMeters, isGoogleMapsConfigured } from "../services/googleMaps";
import { getTransitSuggestion } from "../services/maasProvider";
import { parseDepartureTime } from "../lib/parseDepartureTime";
import { AGE_BUCKETS, REEL_CATEGORIES, TRAVEL_MODES, ageBucketFromBirthYear, parseTravelerTags } from "../types";
import { POINTS_PER_TRAVEL_REPORT, getUserPoints } from "../lib/points";
import { hasTravelStyle, scoreReel } from "../lib/personalize";
import { summarizeByOriginAndMode, summarizeOrigins } from "../lib/travelReports";

const PERSONALIZED_POOL = 100;

// Builds the per-viewer state (liked/saved/followed) for one reel row fetched
// with the `likes`/`saves` conditional includes below, layered on top of the
// viewer's follow set fetched once per request.
function viewerStateFor(reel: { likes?: unknown; saves?: unknown }, followed: Awaited<ReturnType<typeof getFollowedIds>>): ReelViewerState {
  return {
    likedByMe: Array.isArray(reel.likes) && reel.likes.length > 0,
    savedByMe: Array.isArray(reel.saves) && reel.saves.length > 0,
    ...followed,
  };
}

const router = Router();

// Resolves the municipality/company a MUNICIPALITY or COMPANY user is allowed to
// post as. Returns null (with the response already sent) if their profile is
// missing — e.g. the demo database reset independently of their login token.
async function resolvePosterContext(
  req: Request,
  res: Response
): Promise<{ municipalityId: string; companyId: string | null } | null> {
  if (req.auth!.role === "MUNICIPALITY") {
    const municipality = await prisma.municipality.findUnique({ where: { userId: req.auth!.userId } });
    if (!municipality) {
      res.status(404).json({ error: "自治体プロフィールが見つかりません" });
      return null;
    }
    return { municipalityId: municipality.id, companyId: null };
  }

  const company = await prisma.company.findUnique({ where: { userId: req.auth!.userId } });
  if (!company) {
    res.status(404).json({ error: "企業プロフィールが見つかりません" });
    return null;
  }
  return { municipalityId: company.municipalityId, companyId: company.id };
}

// Feed: main "おすすめ" reel feed, newest first (paginated). Optionally filtered to
// a single category tab (自然/文化/アクティビティー/宿/飲食店) via ?category=.
router.get("/", optionalAuth, async (req, res) => {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const category =
    typeof req.query.category === "string" && (REEL_CATEGORIES as readonly string[]).includes(req.query.category)
      ? req.query.category
      : undefined;
  const take = 10;

  const followed = await getFollowedIds(req.auth?.userId);

  // Personalized おすすめ: on the unfiltered tab, a signed-in user with a
  // travel style set gets posts ranked by how well they match it (ties stay
  // newest-first), each tagged with why. Ranking needs the whole candidate
  // set, so this returns the latest PERSONALIZED_POOL posts in one page
  // instead of cursor-paginating.
  if (req.auth && !category && !cursor) {
    const style = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { travelCompanion: true, needsBarrierFree: true, needsMultilingual: true, favoriteCategories: true },
    });
    if (style && hasTravelStyle(style)) {
      const pool = await prisma.reel.findMany({
        take: PERSONALIZED_POOL,
        orderBy: { createdAt: "desc" },
        include: {
          ...reelInclude,
          likes: { where: { userId: req.auth.userId }, select: { id: true } },
          saves: { where: { userId: req.auth.userId }, select: { id: true } },
        },
      });
      const ranked = pool
        .map((reel, index) => ({ reel, index, ...scoreReel(reel, style) }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const items = await Promise.all(
        ranked.map(async ({ reel, reasons }) => ({
          ...(await serializeReel(reel, viewerStateFor(reel, followed))),
          recommendReasons: reasons,
        }))
      );
      return res.json({ items, nextCursor: null, personalized: true });
    }
  }

  const reels = await prisma.reel.findMany({
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    ...(category ? { where: { category } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
      saves: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });

  const items = await Promise.all(reels.map((r) => serializeReel(r, viewerStateFor(r, followed))));
  const nextCursor = reels.length === take ? reels[reels.length - 1].id : null;
  res.json({ items, nextCursor, personalized: false });
});

// Reels the signed-in user has liked (used by the read-only tourist "マイページ").
// Must be registered before "/:id" so "liked" isn't matched as a reel id.
router.get("/liked", requireAuth, async (req, res) => {
  const followed = await getFollowedIds(req.auth!.userId);
  const likes = await prisma.like.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    include: {
      reel: {
        include: {
          ...reelInclude,
          saves: { where: { userId: req.auth!.userId }, select: { id: true } },
        },
      },
    },
  });

  res.json({
    items: await Promise.all(
      likes.map((l) => serializeReel(l.reel, { likedByMe: true, savedByMe: l.reel.saves.length > 0, ...followed }))
    ),
  });
});

// Reels the signed-in user has saved/bookmarked — the feed's "保存中" tab.
// Must be registered before "/:id" so "saved" isn't matched as a reel id.
router.get("/saved", requireAuth, async (req, res) => {
  const followed = await getFollowedIds(req.auth!.userId);
  const saves = await prisma.savedReel.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    include: {
      reel: {
        include: {
          ...reelInclude,
          likes: { where: { userId: req.auth!.userId }, select: { id: true } },
        },
      },
    },
  });

  res.json({
    items: await Promise.all(
      saves.map((s) => serializeReel(s.reel, { likedByMe: s.reel.likes.length > 0, savedByMe: true, ...followed }))
    ),
  });
});

// しおり (itinerary): chains the signed-in user's saved/bookmarked reels into
// a route — in the order they arranged (PUT /reels/itinerary/order), falling
// back to save order — with a real-or-mock travel estimate between each
// consecutive pair (see getTransitSuggestion), reusing the exact same mock
// fallback this app uses everywhere else. Both ends of those legs are known
// reel coordinates, so nothing needs geocoding; only the optional leg from the
// user's typed trip origin to the first stop does, like the access planner.
// Reels without location data can't be chained and are skipped. The frontend
// turns the legs + each stop's stayMinutes + the start time into a timeline.
// Must be registered before "/:id" so "itinerary" isn't matched as a reel id.
router.get("/itinerary", requireAuth, async (req, res) => {
  const [user, saves] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { itineraryOrigin: true, itineraryStartTime: true },
    }),
    prisma.savedReel.findMany({
      where: { userId: req.auth!.userId },
      include: {
        reel: {
          include: { municipality: { select: { id: true, name: true, avatarUrl: true, prefecture: true } } },
        },
      },
    }),
  ]);

  const ordered = saves
    .filter((s) => s.reel.locationLat != null && s.reel.locationLng != null)
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
  const stops = ordered.map((s) => s.reel);

  const originLabel = user?.itineraryOrigin ?? "";
  let originLeg = null;
  if (originLabel && stops.length > 0) {
    let originCoords: { lat: number; lng: number } | null = null;
    if (isGoogleMapsConfigured()) {
      try {
        const geocoded = await geocode(originLabel);
        if (geocoded) originCoords = { lat: geocoded.lat, lng: geocoded.lng };
      } catch (err) {
        console.error("[reels] Geocoding itinerary origin failed:", err);
      }
    }
    // Without coordinates for the typed origin, the only fallback would be the
    // name-hash mock, which can be hours off — and on a timeline that error
    // shifts every clock time after it. So leave the leg out instead, and let
    // the client say why (originLocated: false).
    if (originCoords) {
      const first = stops[0];
      originLeg = await getTransitSuggestion(
        first.locationName || first.municipality.name,
        first.locationLat!,
        first.locationLng!,
        { label: originLabel, ...originCoords }
      );
    }
  }

  const legs = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    legs.push(
      await getTransitSuggestion(
        to.locationName || to.municipality.name,
        to.locationLat!,
        to.locationLng!,
        { label: from.locationName || from.municipality.name, lat: from.locationLat!, lng: from.locationLng! }
      )
    );
  }

  res.json({
    originLabel,
    startTime: user?.itineraryStartTime ?? "09:00",
    originLeg,
    originLocated: originLeg != null,
    stops: ordered.map(({ reel: r, stayMinutes }) => ({
      id: r.id,
      caption: r.caption,
      category: r.category,
      locationName: r.locationName,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
      videoUrl: r.videoUrl,
      municipality: r.municipality,
      stayMinutes,
    })),
    legs,
  });
});

const itineraryOrderSchema = z.object({ reelIds: z.array(z.string()).max(200) });

// Rearrange the しおり: positions follow the given order. Ids the user hasn't
// saved are ignored rather than rejected, so a stale client list can't fail.
router.put("/itinerary/order", requireAuth, async (req, res) => {
  const parsed = itineraryOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });

  await prisma.$transaction(
    parsed.data.reelIds.map((reelId, position) =>
      prisma.savedReel.updateMany({ where: { userId: req.auth!.userId, reelId }, data: { position } })
    )
  );
  res.status(204).end();
});

const itinerarySettingsSchema = z.object({
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

router.put("/itinerary/settings", requireAuth, async (req, res) => {
  const parsed = itinerarySettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });

  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: {
      ...(parsed.data.originLabel !== undefined ? { itineraryOrigin: parsed.data.originLabel } : {}),
      ...(parsed.data.startTime !== undefined ? { itineraryStartTime: parsed.data.startTime } : {}),
    },
  });
  res.status(204).end();
});

// Reels from municipalities/companies the signed-in user follows — the feed's
// "フォロー中" tab. Following a municipality surfaces all reels under its name
// (including its linked companies' posts, matching the attribution shown
// elsewhere), while following a company surfaces only that company's own reels.
// Must be registered before "/:id" so "following" isn't matched as a reel id.
router.get("/following", requireAuth, async (req, res) => {
  const followed = await getFollowedIds(req.auth!.userId);
  const municipalityIds = [...followed.followedMunicipalityIds];
  const companyIds = [...followed.followedCompanyIds];
  if (municipalityIds.length === 0 && companyIds.length === 0) {
    return res.json({ items: [] });
  }

  const reels = await prisma.reel.findMany({
    where: {
      OR: [
        ...(municipalityIds.length ? [{ municipalityId: { in: municipalityIds } }] : []),
        ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      ...reelInclude,
      likes: { where: { userId: req.auth!.userId }, select: { id: true } },
      saves: { where: { userId: req.auth!.userId }, select: { id: true } },
    },
  });

  res.json({ items: await Promise.all(reels.map((r) => serializeReel(r, viewerStateFor(r, followed)))) });
});

// Reels the signed-in municipality/company account is allowed to manage — all
// reels under the municipality (including affiliated companies' posts) for a
// municipality account, or only its own posts for a company account.
// Must be registered before "/:id" so "mine" isn't matched as a reel id.
router.get("/mine", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reels = await prisma.reel.findMany({
    where: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
    orderBy: { createdAt: "desc" },
    include: reelInclude,
  });

  res.json({ items: await Promise.all(reels.map((r) => serializeReel(r, anonymousViewerState()))) });
});

// Trip-planning signals for the posts a municipality/company manages: how many
// travelers bookmarked each one (bookmarks are what build a しおり), how many
// recorded an actual travel time, and where travelers say they came from —
// origins only once enough different users share them (lib/travelReports.ts).
// Must be registered before "/:id" so "mine" isn't matched as a reel id.
router.get("/mine/trip-planning", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reels = await prisma.reel.findMany({
    where: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
    select: { id: true },
  });
  const reelIds = reels.map((r) => r.id);

  const [saveCounts, reports] = await Promise.all([
    prisma.savedReel.groupBy({ by: ["reelId"], where: { reelId: { in: reelIds } }, _count: { _all: true } }),
    prisma.travelTimeReport.findMany({
      where: { reelId: { in: reelIds } },
      select: { reelId: true, userId: true, mode: true, durationMin: true, originLabel: true },
    }),
  ]);

  const byReel: Record<string, { saves: number; travelReports: number }> = {};
  for (const id of reelIds) byReel[id] = { saves: 0, travelReports: 0 };
  for (const s of saveCounts) byReel[s.reelId].saves = s._count._all;
  for (const r of reports) byReel[r.reelId].travelReports++;

  res.json({
    totals: {
      saves: saveCounts.reduce((sum, s) => sum + s._count._all, 0),
      travelReports: reports.length,
    },
    byReel,
    ...summarizeOrigins(reports),
  });
});

// Aggregated, anonymized audience breakdown (nationality / age bucket) across all
// reels the signed-in municipality/company account can manage — built from the
// ReelView log rather than viewCount so it can be attributed to individual
// viewers' (optional, self-reported) profile fields. Must be registered before
// "/:id" so "mine" isn't matched as a reel id.
router.get(
  "/mine/demographics",
  requireAuth,
  requireRole("MUNICIPALITY", "COMPANY"),
  async (req, res) => {
    const poster = await resolvePosterContext(req, res);
    if (!poster) return;

    const reels = await prisma.reel.findMany({
      where: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
      select: { id: true },
    });

    const views = await prisma.reelView.findMany({
      where: { reelId: { in: reels.map((r) => r.id) } },
      select: { viewer: { select: { nationality: true, birthYear: true } } },
    });

    const nationalityCounts = new Map<string, number>();
    const ageBucketCounts = new Map<string, number>();
    for (const v of views) {
      const nationality = v.viewer?.nationality ?? "unknown";
      nationalityCounts.set(nationality, (nationalityCounts.get(nationality) ?? 0) + 1);
      const bucket = v.viewer?.birthYear ? ageBucketFromBirthYear(v.viewer.birthYear) : "unknown";
      ageBucketCounts.set(bucket, (ageBucketCounts.get(bucket) ?? 0) + 1);
    }

    res.json({
      totalViews: views.length,
      byNationality: [...nationalityCounts.entries()]
        .map(([nationality, count]) => ({ nationality, count }))
        .sort((a, b) => b.count - a.count),
      byAgeBucket: [...AGE_BUCKETS, "unknown"].map((bucket) => ({
        bucket,
        count: ageBucketCounts.get(bucket) ?? 0,
      })),
    });
  }
);

router.get("/:id", optionalAuth, async (req, res) => {
  const followed = await getFollowedIds(req.auth?.userId);
  const reel = await prisma.reel.findUnique({
    where: { id: req.params.id },
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
      saves: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  await Promise.all([
    prisma.reel.update({ where: { id: reel.id }, data: { viewCount: { increment: 1 } } }),
    prisma.reelView.create({ data: { reelId: reel.id, viewerId: req.auth?.userId ?? null } }),
  ]);

  res.json(await serializeReel(reel, viewerStateFor(reel, followed)));
});

// Pitch deck item "(1) 近隣の観光スポットの掲載": while looking at one post, surface
// other posts located nearby (regardless of which municipality/company posted
// them) so a viewer who's found one spot can discover more around it. Distance
// is computed in-process with the haversine helper rather than in SQL — the
// dataset is small and SQLite has no built-in geo distance function.
const NEARBY_RADIUS_METERS = 50_000;
const NEARBY_LIMIT = 6;

// Optional ?category= narrows it to one kind of place (e.g. 近くの宿).
router.get("/:id/nearby", optionalAuth, async (req, res) => {
  const category =
    typeof req.query.category === "string" && (REEL_CATEGORIES as readonly string[]).includes(req.query.category)
      ? req.query.category
      : undefined;
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  if (reel.locationLat == null || reel.locationLng == null) {
    return res.json({ items: [], spots: [] });
  }
  const origin = { lat: reel.locationLat, lng: reel.locationLng };

  const followed = await getFollowedIds(req.auth?.userId);
  const candidates = await prisma.reel.findMany({
    where: { id: { not: reel.id }, locationLat: { not: null }, locationLng: { not: null }, ...(category ? { category } : {}) },
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
      saves: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });

  const nearby = candidates
    .map((r) => ({ reel: r, distanceMeters: haversineMeters(origin, { lat: r.locationLat!, lng: r.locationLng! }) }))
    .filter((r) => r.distanceMeters <= NEARBY_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, NEARBY_LIMIT);

  // Municipalities' 観光情報 spots that have a location — text-only entries
  // (no video), and uncategorized, so only on the unfiltered list.
  const spots = category
    ? []
    : (
        await prisma.tourismSpot.findMany({
          where: { locationLat: { not: null }, locationLng: { not: null } },
          include: { municipality: { select: { id: true, name: true } } },
        })
      )
        .map((spot) => ({
          spot,
          distanceMeters: haversineMeters(origin, { lat: spot.locationLat!, lng: spot.locationLng! }),
        }))
        .filter((s) => s.distanceMeters <= NEARBY_RADIUS_METERS)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, NEARBY_LIMIT);

  res.json({
    items: await Promise.all(
      nearby.map(async ({ reel: r, distanceMeters }) => ({
        ...(await serializeReel(r, viewerStateFor(r, followed))),
        distanceMeters: Math.round(distanceMeters),
      }))
    ),
    spots: spots.map(({ spot, distanceMeters }) => ({
      id: spot.id,
      name: spot.name,
      description: spot.description,
      municipality: spot.municipality,
      distanceMeters: Math.round(distanceMeters),
    })),
  });
});

// 「みんなの実測」: average of travelers' self-reported actual travel times to
// this reel's location, grouped by starting point + mode — a single average
// across all origins would be meaningless (小田原から vs 松本駅から differ by
// hours). Origins are matched by normalized text, so "小田原駅" and "小田原"
// count as different starting points, and only shown once enough different
// users share them (see lib/travelReports.ts). Also returns the signed-in
// viewer's own reports, which they can always see.
router.get("/:id/travel-reports", optionalAuth, async (req, res) => {
  const reports = await prisma.travelTimeReport.findMany({
    where: { reelId: req.params.id },
    select: { userId: true, mode: true, durationMin: true, originLabel: true },
  });

  res.json({
    ...summarizeByOriginAndMode(reports),
    mine: req.auth
      ? reports
          .filter((r) => r.userId === req.auth!.userId)
          .map((r) => ({ mode: r.mode, durationMin: r.durationMin, originLabel: r.originLabel }))
      : [],
  });
});

const travelReportSchema = z.object({
  mode: z.enum(TRAVEL_MODES),
  durationMin: z.coerce.number().int().min(1).max(24 * 60),
  originLabel: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1).max(100)),
});

// Record "it actually took me N minutes" — traveler accounts only, since the
// point of the data is real trips. Upserts per (user, reel, mode): a first
// report earns points, re-recording just corrects the time without earning more.
router.post("/:id/travel-reports", requireAuth, requireRole("USER"), async (req, res) => {
  const parsed = travelReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  const key = { userId: req.auth!.userId, reelId: reel.id, mode: parsed.data.mode };
  const existing = await prisma.travelTimeReport.findUnique({ where: { userId_reelId_mode: key } });
  await prisma.travelTimeReport.upsert({
    where: { userId_reelId_mode: key },
    create: { ...key, durationMin: parsed.data.durationMin, originLabel: parsed.data.originLabel },
    update: { durationMin: parsed.data.durationMin, originLabel: parsed.data.originLabel },
  });

  res.status(existing ? 200 : 201).json({
    pointsAwarded: existing ? 0 : POINTS_PER_TRAVEL_REPORT,
    ...(await getUserPoints(req.auth!.userId)),
  });
});

const travelerTagsField = z.preprocess(parseTravelerTags, z.array(z.string()));

const createSchema = z.object({
  caption: z.string().max(2000).optional().default(""),
  category: z.enum(REEL_CATEGORIES),
  travelerTags: travelerTagsField.optional().default([]),
  locationName: z.string().max(200).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
});

// Create reel. Only municipality accounts and companies linked to a municipality
// may post — enforced by requireRole here, with the actual municipality/company
// resolved per-account in resolvePosterContext.
router.post(
  "/",
  requireAuth,
  requireRole("MUNICIPALITY", "COMPANY"),
  upload.single("video"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "動画ファイルがありません" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const poster = await resolvePosterContext(req, res);
    if (!poster) return;

    // If a location name was given but coordinates weren't, geocode it server-side
    // (coordinates are still an optional manual override in the uploader form). A
    // slow/failed geocode call must not block the post — fall back to no coordinates.
    let { locationLat, locationLng } = parsed.data;
    if (parsed.data.locationName && locationLat == null && locationLng == null && isGoogleMapsConfigured()) {
      try {
        const result = await geocode(parsed.data.locationName);
        if (result) {
          locationLat = result.lat;
          locationLng = result.lng;
        }
      } catch (err) {
        console.error("[reels] Geocoding failed, posting without coordinates:", err);
      }
    }

    const reel = await prisma.reel.create({
      data: {
        municipalityId: poster.municipalityId,
        companyId: poster.companyId,
        videoUrl: `/uploads/${req.file.filename}`,
        caption: parsed.data.caption,
        category: parsed.data.category,
        travelerTags: parsed.data.travelerTags.join(","),
        locationName: parsed.data.locationName,
        locationLat,
        locationLng,
      },
      include: reelInclude,
    });

    res.status(201).json(await serializeReel(reel, anonymousViewerState()));
  }
);

// JSON body (unlike the multipart create form): coordinates may be explicitly
// null to clear them, which also asks the server to geocode the place name.
const updateSchema = z.object({
  caption: z.string().max(2000).optional(),
  category: z.enum(REEL_CATEGORIES).optional(),
  travelerTags: travelerTagsField.optional(),
  locationName: z
    .string()
    .max(200)
    .transform((v) => v.trim() || null)
    .optional(),
  locationLat: z.number().min(-90).max(90).nullable().optional(),
  locationLng: z.number().min(-180).max(180).nullable().optional(),
});

// A municipality may edit/delete any reel under its name (including ones posted by
// its linked companies, for moderation); a company may only edit/delete its own.
function canManage(
  reel: { municipalityId: string; companyId: string | null },
  poster: { municipalityId: string; companyId: string | null }
) {
  if (poster.companyId) return reel.companyId === poster.companyId;
  return reel.municipalityId === poster.municipalityId;
}

router.put("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || !canManage(reel, poster)) {
    return res.status(404).json({ error: "投稿が見つかりません" });
  }

  const { travelerTags, locationLat, locationLng, ...rest } = parsed.data;
  const coords: { locationLat?: number | null; locationLng?: number | null } = {};
  if (locationLat !== undefined || locationLng !== undefined) {
    const latMissing = locationLat == null;
    const lngMissing = locationLng == null;
    if (latMissing !== lngMissing) {
      return res.status(400).json({ error: "緯度と経度は両方入力するか、両方空にしてください" });
    }
    coords.locationLat = locationLat ?? null;
    coords.locationLng = locationLng ?? null;
    // Cleared coordinates + a place name: locate it, as POST /reels does. A
    // failed lookup leaves the post without coordinates rather than failing.
    const placeName = rest.locationName !== undefined ? rest.locationName : reel.locationName;
    if (coords.locationLat === null && placeName && isGoogleMapsConfigured()) {
      try {
        const result = await geocode(placeName);
        if (result) {
          coords.locationLat = result.lat;
          coords.locationLng = result.lng;
        }
      } catch (err) {
        console.error("[reels] Geocoding on update failed, saving without coordinates:", err);
      }
    }
  }

  const updated = await prisma.reel.update({
    where: { id: reel.id },
    data: { ...rest, ...coords, ...(travelerTags ? { travelerTags: travelerTags.join(",") } : {}) },
    include: reelInclude,
  });
  res.json(await serializeReel(updated, anonymousViewerState()));
});

router.delete("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || !canManage(reel, poster)) {
    return res.status(404).json({ error: "投稿が見つかりません" });
  }

  await prisma.reel.delete({ where: { id: reel.id } });
  res.status(204).end();
});

// Like / unlike (general users)
router.post("/:id/like", requireAuth, async (req, res) => {
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  await prisma.like.upsert({
    where: { userId_reelId: { userId: req.auth!.userId, reelId: reel.id } },
    create: { userId: req.auth!.userId, reelId: reel.id },
    update: {},
  });
  res.status(204).end();
});

router.delete("/:id/like", requireAuth, async (req, res) => {
  await prisma.like.deleteMany({ where: { userId: req.auth!.userId, reelId: req.params.id } });
  res.status(204).end();
});

// Save / unsave (bookmark a reel to find again later — the feed's "保存中" tab)
router.post("/:id/save", requireAuth, async (req, res) => {
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  await prisma.savedReel.upsert({
    where: { userId_reelId: { userId: req.auth!.userId, reelId: reel.id } },
    create: { userId: req.auth!.userId, reelId: reel.id },
    update: {},
  });
  res.status(204).end();
});

const stayMinutesSchema = z.object({ stayMinutes: z.coerce.number().int().min(0).max(24 * 60) });

// Planned stay at one しおり stop.
router.patch("/:id/save", requireAuth, async (req, res) => {
  const parsed = stayMinutesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });

  const { count } = await prisma.savedReel.updateMany({
    where: { userId: req.auth!.userId, reelId: req.params.id },
    data: { stayMinutes: parsed.data.stayMinutes },
  });
  if (count === 0) return res.status(404).json({ error: "保存されていない投稿です" });
  res.status(204).end();
});

router.delete("/:id/save", requireAuth, async (req, res) => {
  await prisma.savedReel.deleteMany({ where: { userId: req.auth!.userId, reelId: req.params.id } });
  res.status(204).end();
});

// "アクセス" button on the reel viewer: given a starting point the viewer types
// in, estimate travel time / mode / fare from there to THIS reel's specific
// location (as opposed to GET /municipalities/:id/access-plan, which always
// estimates to the municipality's reference station). No auth required — a
// user-initiated, one-shot lookup, so it doesn't add to the automatic
// per-reel-view Directions cost. Falls back to a deterministic mock if Maps
// isn't configured or the typed origin can't be geocoded.
router.get("/:id/access-plan", async (req, res) => {
  const origin = typeof req.query.origin === "string" ? req.query.origin.trim() : "";
  if (!origin) return res.status(400).json({ error: "出発地点を入力してください" });

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  if (reel.locationLat == null || reel.locationLng == null) {
    return res.status(400).json({ error: "この投稿には位置情報が設定されていません" });
  }

  let originCoords: { lat: number; lng: number } | null = null;
  if (isGoogleMapsConfigured()) {
    try {
      const geocoded = await geocode(origin);
      if (geocoded) originCoords = { lat: geocoded.lat, lng: geocoded.lng };
    } catch (err) {
      console.error("[reels] Geocoding access-plan origin failed:", err);
    }
  }

  const suggestion = await getTransitSuggestion(
    reel.locationName || "目的地",
    reel.locationLat,
    reel.locationLng,
    { label: origin, ...originCoords },
    parseDepartureTime(req.query.datetime)
  );
  res.json(suggestion);
});

// Small route-preview image for the access-plan detail panel — same
// one-shot, user-initiated shape as /access-plan above (only called when a
// viewer expands a mode card), proxied through the backend so the Maps API
// key never reaches the browser (see the doc comment on getStaticMapImage).
// 404s whenever a real map can't be produced (Maps not configured, origin
// not geocodable, or Directions/Static Maps failed) — the frontend falls
// back to a plain schematic line rather than treating this as a hard error.
router.get("/:id/access-map", async (req, res) => {
  const origin = typeof req.query.origin === "string" ? req.query.origin.trim() : "";
  if (!origin || !isGoogleMapsConfigured()) return res.status(404).end();

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
  if (!reel || reel.locationLat == null || reel.locationLng == null) return res.status(404).end();

  try {
    const geocoded = await geocode(origin);
    if (!geocoded) return res.status(404).end();

    const originCoords = { lat: geocoded.lat, lng: geocoded.lng };
    const destinationCoords = { lat: reel.locationLat, lng: reel.locationLng };
    const route = await getRouteEstimate(originCoords, destinationCoords);
    const image = await getStaticMapImage(originCoords, destinationCoords, route?.polyline ?? null);
    if (!image) return res.status(404).end();

    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(image.body));
  } catch (err) {
    console.error("[reels] access-map failed:", err);
    res.status(404).end();
  }
});

// Comments
const commentSchema = z.object({ body: z.string().min(1).max(500) });

router.get("/:id/comments", async (req, res) => {
  const comments = await prisma.comment.findMany({
    where: { reelId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(comments);
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const reel = await prisma.reel.findUnique({
    where: { id: req.params.id },
    include: {
      municipality: { select: { commentsEnabled: true } },
      company: { select: { commentsEnabled: true } },
    },
  });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  // The municipality can turn off comments for everything under its name
  // (including its companies' posts, mirroring its moderation authority over
  // them elsewhere in the app); a company can additionally turn off comments
  // on just its own posts. Either "off" wins.
  const commentsEnabled = reel.municipality.commentsEnabled && (reel.company?.commentsEnabled ?? true);
  if (!commentsEnabled) {
    return res.status(403).json({ error: "この投稿はコメントが許可されていません" });
  }

  const comment = await prisma.comment.create({
    data: { body: parsed.data.body, reelId: reel.id, userId: req.auth!.userId },
    include: { user: { select: { id: true, name: true } } },
  });
  res.status(201).json(comment);
});

export default router;
