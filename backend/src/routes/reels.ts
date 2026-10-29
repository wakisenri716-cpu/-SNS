import { Request, Response, Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { uploadVideo } from "../middleware/upload";
import { anonymousViewerState, reelInclude, serializeReel, type ReelViewerState, REEL_ORDER } from "../lib/reelSerializer";
import { getFollowedIds } from "../lib/followState";
import { geocode, getRouteEstimate, getStaticMapImage, haversineMeters, isGoogleMapsConfigured } from "../services/googleMaps";
import { getTransitSuggestion } from "../services/maasProvider";
import { parseDepartureTime } from "../lib/parseDepartureTime";
import { AGE_BUCKETS, REEL_CATEGORIES, TRAVEL_MODES, ageBucketFromBirthYear, parseBestMonths, parseTravelerTags } from "../types";
import { POINTS_PER_TRAVEL_REPORT, getUserPoints } from "../lib/points";
import { hasTravelStyle, scoreReel } from "../lib/personalize";
import { notifyFollowersOfNewPost, notifyPoster } from "../lib/notifications";
import { summarizeByOriginAndMode, summarizeOrigins } from "../lib/travelReports";
import { conciergeLimiter, reactionLimiter, translateLimiter, writeLimiter } from "../middleware/rateLimit";
import { resolvePosterContext } from "../lib/posterContext";
import { planTrip } from "../services/tripPlanner";
import { isClaudeConfigured, logClaudeError } from "../services/claude";
import { translateCaption } from "../services/translate";
import { accessibleTrip, addToTrip, defaultTripFor, syncSaved, syncSavedForTrip, tripsOf } from "../lib/trips";
import { inSeasonWhere, monthInJapan } from "../lib/season";
import { todayInJapan } from "./events";
import { announceNewPost, listenForNewPosts, liveCounts, sendToWatchers, watch } from "../lib/presence";

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


// Feed: main "おすすめ" reel feed, newest first (paginated). Optionally filtered to
// a single category tab (自然/文化/アクティビティー/宿/飲食店) via ?category=,
// or to posts whose poster-set 見頃 includes this month via ?season=now.
router.get("/", optionalAuth, async (req, res) => {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const category =
    typeof req.query.category === "string" && (REEL_CATEGORIES as readonly string[]).includes(req.query.category)
      ? req.query.category
      : undefined;
  const inSeason = req.query.season === "now";
  const where = {
    ...(category ? { category } : {}),
    ...(inSeason ? inSeasonWhere(monthInJapan()) : {}),
  };
  const take = 10;

  const followed = await getFollowedIds(req.auth?.userId);

  // Personalized おすすめ: on the unfiltered tab, a signed-in user with a
  // travel style set gets posts ranked by how well they match it (ties stay
  // newest-first), each tagged with why. Ranking needs the whole candidate
  // set, so this returns the latest PERSONALIZED_POOL posts in one page
  // instead of cursor-paginating.
  if (req.auth && !category && !inSeason && !cursor) {
    const style = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { travelCompanion: true, needsBarrierFree: true, needsMultilingual: true, favoriteCategories: true },
    });
    if (style && hasTravelStyle(style)) {
      const pool = await prisma.reel.findMany({
        take: PERSONALIZED_POOL,
        orderBy: REEL_ORDER,
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
    where,
    orderBy: REEL_ORDER,
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

function openEventStream(res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tell nginx-style proxies not to buffer the stream.
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");
}

// いま見られている場所: { reelId: number of tabs with it open } for every
// spot being viewed right now (counts only), for the map and feed to light
// them up. Must be registered before "/:id".
router.get("/live-counts", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ counts: liveCounts() });
});

// 新しい投稿: a Server-Sent Events stream with an "event: post" each time a
// reel is published, so open feeds can offer "新しい投稿があります".
// Must be registered before "/:id".
router.get("/feed/live", (req, res) => {
  openEventStream(res);
  if (!listenForNewPosts(res, (fn) => req.on("close", fn))) {
    res.write("event: busy\ndata: 0\n\n");
    res.end();
  }
});

// Reels the signed-in user has liked (used by the read-only tourist "マイページ").
// Must be registered before "/:id" so "liked" isn't matched as a reel id.
// 地図で探す: every post that has a location, newest first, for plotting on
// the map (capped; plenty at the current scale).
const MAP_LIMIT = 300;
router.get("/map", optionalAuth, async (req, res) => {
  const followed = await getFollowedIds(req.auth?.userId);
  const reels = await prisma.reel.findMany({
    where: { locationLat: { not: null }, locationLng: { not: null } },
    take: MAP_LIMIT,
    orderBy: REEL_ORDER,
    include: {
      ...reelInclude,
      likes: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
      saves: req.auth ? { where: { userId: req.auth.userId }, select: { id: true } } : false,
    },
  });
  res.json({ items: await Promise.all(reels.map((r) => serializeReel(r, viewerStateFor(r, followed)))) });
});

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
// LIVE for posters: how many people have each of their posts open right now
// (counts only, from lib/presence). Must be registered before "/:id".
router.get("/mine/live", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const counts = liveCounts();
  const ids = Object.keys(counts);
  const mine = ids.length
    ? await prisma.reel.findMany({
        where: { id: { in: ids }, ...(poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId }) },
        select: { id: true, locationName: true, caption: true, videoUrl: true },
      })
    : [];
  const items = mine
    .map((r) => ({ id: r.id, place: r.locationName || r.caption.slice(0, 30), videoUrl: r.videoUrl, viewers: counts[r.id] }))
    .sort((a, b) => b.viewers - a.viewers);
  res.set("Cache-Control", "no-store").json({ total: items.reduce((n, i) => n + i.viewers, 0), items });
});

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
// Reported comments on the signed-in poster's posts, most-reported first, for
// review in the dashboard. Must be registered before "/:id".
router.get("/mine/reported-comments", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const comments = await prisma.comment.findMany({
    where: {
      reports: { some: {} },
      reel: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
    },
    include: {
      user: { select: { name: true } },
      reel: { select: { id: true, locationName: true, caption: true } },
      reports: { select: { reason: true } },
    },
  });
  res.json({
    hideThreshold: COMMENT_HIDE_THRESHOLD,
    items: comments
      .map((c) => ({
        id: c.id,
        body: c.body,
        authorName: c.user.name,
        createdAt: c.createdAt,
        reel: { id: c.reel.id, title: c.reel.locationName || c.reel.caption.slice(0, 30) },
        reportCount: c.reports.length,
        reasons: c.reports.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {}),
      }))
      .sort((a, b) => b.reportCount - a.reportCount),
  });
});

router.get("/mine/trip-planning", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;

  const reels = await prisma.reel.findMany({
    where: poster.companyId ? { companyId: poster.companyId } : { municipalityId: poster.municipalityId },
    select: { id: true },
  });
  const reelIds = reels.map((r) => r.id);

  const [saveCounts, visitCounts, reports] = await Promise.all([
    prisma.savedReel.groupBy({ by: ["reelId"], where: { reelId: { in: reelIds } }, _count: { _all: true } }),
    prisma.visit.groupBy({ by: ["reelId"], where: { reelId: { in: reelIds } }, _count: { _all: true } }),
    prisma.travelTimeReport.findMany({
      where: { reelId: { in: reelIds } },
      select: { reelId: true, userId: true, mode: true, durationMin: true, originLabel: true },
    }),
  ]);

  const byReel: Record<string, { saves: number; travelReports: number; visits: number }> = {};
  for (const id of reelIds) byReel[id] = { saves: 0, travelReports: 0, visits: 0 };
  for (const s of saveCounts) byReel[s.reelId].saves = s._count._all;
  for (const v of visitCounts) byReel[v.reelId].visits = v._count._all;
  for (const r of reports) byReel[r.reelId].travelReports++;

  res.json({
    totals: {
      saves: saveCounts.reduce((sum, s) => sum + s._count._all, 0),
      travelReports: reports.length,
      // スタンプラリー check-ins: people who were actually there.
      visits: visitCounts.reduce((sum, v) => sum + v._count._all, 0),
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
// いま見ている人数 for a spot, as a Server-Sent Events stream: an
// "event: count" with the number of browser tabs on this spot now, sent on
// connect and whenever it changes (see lib/presence.ts).
router.get("/:id/live", async (req, res) => {
  const clientId = typeof req.query.client === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(req.query.client) ? req.query.client : null;
  if (!clientId) return res.status(400).json({ error: "client が必要です" });
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  openEventStream(res);
  const ok = watch(reel.id, clientId, res, (fn) => req.on("close", fn));
  if (!ok) {
    res.write("event: busy\ndata: 0\n\n");
    res.end();
  }
});

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
router.post("/:id/travel-reports", writeLimiter, requireAuth, requireRole("USER"), async (req, res) => {
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
const bestMonthsField = z.preprocess(parseBestMonths, z.array(z.number()));

const createSchema = z.object({
  caption: z.string().max(2000).optional().default(""),
  category: z.enum(REEL_CATEGORIES),
  travelerTags: travelerTagsField.optional().default([]),
  bestMonths: bestMonthsField.optional().default([]),
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
  uploadVideo.single("video"),
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
        bestMonths: parsed.data.bestMonths.join(","),
        locationName: parsed.data.locationName,
        locationLat,
        locationLng,
      },
      include: reelInclude,
    });

    announceNewPost(reel.id);
    await notifyFollowersOfNewPost({
      reelId: reel.id,
      actorId: req.auth!.userId,
      municipalityId: poster.municipalityId,
      companyId: poster.companyId,
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
  bestMonths: bestMonthsField.optional(),
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

  const { travelerTags, bestMonths, locationLat, locationLng, ...rest } = parsed.data;
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
    data: {
      ...rest,
      ...coords,
      ...(travelerTags ? { travelerTags: travelerTags.join(",") } : {}),
      ...(bestMonths ? { bestMonths: bestMonths.join(",") } : {}),
    },
    include: reelInclude,
  });
  // Cached translations no longer match an edited caption.
  if (rest.caption !== undefined && rest.caption !== reel.caption) {
    await prisma.reelTranslation.deleteMany({ where: { reelId: reel.id } });
  }
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

  const key = { userId: req.auth!.userId, reelId: reel.id };
  const alreadyLiked = await prisma.like.findUnique({ where: { userId_reelId: key }, select: { id: true } });
  if (!alreadyLiked) {
    await prisma.like.upsert({ where: { userId_reelId: key }, create: key, update: {} });
    await notifyPoster({ reelId: reel.id, actorId: req.auth!.userId, type: "like" });
  }
  res.status(204).end();
});

router.delete("/:id/like", requireAuth, async (req, res) => {
  await prisma.like.deleteMany({ where: { userId: req.auth!.userId, reelId: req.params.id } });
  res.status(204).end();
});

// Bookmark a post into a trip (旅): the chosen one (tripId), or else the trip
// touched most recently — a new "はじめての旅" for someone without any. Says
// which trip it went to, so the app can offer to change it. Choosing several
// trips is done with PUT /me/trips/:id/items/:reelId.
const saveSchema = z.object({ tripId: z.string().optional() });

router.post("/:id/save", requireAuth, async (req, res) => {
  const parsed = saveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  const trip = parsed.data.tripId
    ? (await accessibleTrip(req.auth!.userId, parsed.data.tripId))?.trip
    : await defaultTripFor(req.auth!.userId);
  if (!trip) return res.status(404).json({ error: "旅が見つかりません" });
  await addToTrip(req.auth!.userId, trip.id, reel.id);
  res.json({ trip: { id: trip.id, name: trip.name } });
});

// Un-bookmark: out of every trip the user can edit.
router.delete("/:id/save", requireAuth, async (req, res) => {
  const items = await prisma.tripItem.findMany({
    where: { reelId: req.params.id, trip: tripsOf(req.auth!.userId) },
    select: { tripId: true },
  });
  await prisma.tripItem.deleteMany({ where: { reelId: req.params.id, tripId: { in: items.map((i) => i.tripId) } } });
  for (const { tripId } of items) await syncSavedForTrip(tripId, [req.params.id]);
  await syncSaved(req.auth!.userId, [req.params.id]);
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
const commentSchema = z.object({ body: z.string().trim().min(1).max(500) });

// The municipality can turn off comments for everything under its name
// (including its companies' posts, mirroring its moderation authority over
// them elsewhere in the app); a company can additionally turn off comments
// on just its own posts. Either "off" wins.
function commentsEnabledFor(reel: {
  municipality: { commentsEnabled: boolean };
  company: { commentsEnabled: boolean } | null;
}) {
  return reel.municipality.commentsEnabled && (reel.company?.commentsEnabled ?? true);
}

const commentReelInclude = {
  municipality: { select: { commentsEnabled: true } },
  company: { select: { commentsEnabled: true } },
} as const;

// Whether the signed-in account manages this reel (and so may remove any
// comment on it) — the same rule as editing/deleting the reel itself.
async function canModerateComments(
  auth: { userId: string; role: string } | undefined,
  reel: { municipalityId: string; companyId: string | null }
) {
  if (!auth) return false;
  if (auth.role === "MUNICIPALITY") {
    const m = await prisma.municipality.findUnique({ where: { userId: auth.userId }, select: { id: true } });
    return !!m && canManage(reel, { municipalityId: m.id, companyId: null });
  }
  if (auth.role === "COMPANY") {
    const c = await prisma.company.findUnique({ where: { userId: auth.userId } });
    return !!c && canManage(reel, { municipalityId: c.municipalityId, companyId: c.id });
  }
  return false;
}

router.get("/:id/comments", optionalAuth, async (req, res) => {
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, include: commentReelInclude });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });

  const [comments, moderator] = await Promise.all([
    prisma.comment.findMany({
      where: { reelId: reel.id },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true } },
        reports: { select: { reporterId: true } },
      },
    }),
    canModerateComments(req.auth, reel),
  ]);
  res.json({
    commentsEnabled: commentsEnabledFor(reel),
    items: comments
      // Hidden once enough people report it — except to its author and the
      // moderator, who still see it (flagged) so it can be reviewed.
      .filter((c) => c.reports.length < COMMENT_HIDE_THRESHOLD || moderator || c.userId === req.auth?.userId)
      .map(({ reports, ...c }) => ({
        ...c,
        canDelete: moderator || c.userId === req.auth?.userId,
        reportedByMe: !!req.auth && reports.some((r) => r.reporterId === req.auth!.userId),
        hidden: reports.length >= COMMENT_HIDE_THRESHOLD,
      })),
  });
});

router.post("/:id/comments", writeLimiter, requireAuth, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "コメントを入力してください（500文字まで）" });

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, include: commentReelInclude });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  if (!commentsEnabledFor(reel)) {
    return res.status(403).json({ error: "この投稿はコメントが許可されていません" });
  }

  const comment = await prisma.comment.create({
    data: { body: parsed.data.body, reelId: reel.id, userId: req.auth!.userId },
    include: { user: { select: { id: true, name: true } } },
  });
  await notifyPoster({ reelId: reel.id, actorId: req.auth!.userId, type: "comment", commentId: comment.id });
  res.status(201).json({ ...comment, canDelete: true });
});

// Remove a comment: its author, or the account managing the reel (moderation).
router.delete("/:id/comments/:commentId", requireAuth, async (req, res) => {
  const comment = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    include: { reel: { select: { id: true, municipalityId: true, companyId: true } } },
  });
  if (!comment || comment.reel.id !== req.params.id) {
    return res.status(404).json({ error: "コメントが見つかりません" });
  }
  if (comment.userId !== req.auth!.userId && !(await canModerateComments(req.auth, comment.reel))) {
    return res.status(403).json({ error: "このコメントは削除できません" });
  }

  await prisma.comment.delete({ where: { id: comment.id } });
  res.status(204).end();
});

// 通報 a comment (not your own). One report per person per comment.
const COMMENT_HIDE_THRESHOLD = 3;
const reportSchema = z.object({ reason: z.enum(["spam", "abuse", "other"]) });

router.post("/:id/comments/:commentId/report", writeLimiter, requireAuth, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "通報の理由を選んでください" });
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId }, select: { id: true, reelId: true, userId: true } });
  if (!comment || comment.reelId !== req.params.id) return res.status(404).json({ error: "コメントが見つかりません" });
  if (comment.userId === req.auth!.userId) return res.status(400).json({ error: "自分のコメントは通報できません" });
  await prisma.commentReport.upsert({
    where: { commentId_reporterId: { commentId: comment.id, reporterId: req.auth!.userId } },
    create: { commentId: comment.id, reporterId: req.auth!.userId, reason: parsed.data.reason },
    update: { reason: parsed.data.reason },
  });
  res.status(204).end();
});

// Moderator: keep a reported comment — clears its reports (and un-hides it).
router.delete("/:id/comments/:commentId/reports", requireAuth, async (req, res) => {
  const comment = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    include: { reel: { select: { id: true, municipalityId: true, companyId: true } } },
  });
  if (!comment || comment.reel.id !== req.params.id) return res.status(404).json({ error: "コメントが見つかりません" });
  if (!(await canModerateComments(req.auth, comment.reel))) return res.status(403).json({ error: "権限がありません" });
  await prisma.commentReport.deleteMany({ where: { commentId: comment.id } });
  res.status(204).end();
});

// "翻訳を見る": the caption in the viewer's language, translated by Claude
// once per caption/language and cached. 503 when no API key is configured
// (the UI hides the button then — see GET /concierge/status).
const translationSchema = z.object({ lang: z.enum(["en", "zh", "ko"]) });

router.post("/:id/translation", translateLimiter, async (req, res) => {
  const parsed = translationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "翻訳先の言語が正しくありません" });
  const { lang } = parsed.data;

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true, caption: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  if (!reel.caption.trim()) return res.json({ caption: "", cached: true });

  const cached = await prisma.reelTranslation.findUnique({ where: { reelId_lang: { reelId: reel.id, lang } } });
  if (cached) return res.json({ caption: cached.caption, cached: true });

  if (!isClaudeConfigured()) return res.status(503).json({ error: "翻訳機能は現在利用できません" });
  try {
    const caption = await translateCaption(reel.caption, lang);
    await prisma.reelTranslation.upsert({
      where: { reelId_lang: { reelId: reel.id, lang } },
      create: { reelId: reel.id, lang, caption },
      update: { caption },
    });
    res.json({ caption, cached: false });
  } catch (err) {
    logClaudeError("translate", err);
    res.status(502).json({ error: "翻訳できませんでした。しばらくしてからもう一度お試しください" });
  }
});

// A comment translated into the viewer's UI language (any language to any,
// since comments come from everywhere — Japanese staff reading an English
// comment included). Same visibility as GET /:id/comments: a comment hidden
// by reports can't be fetched this way by others.
const commentTranslationSchema = z.object({ lang: z.enum(["ja", "en", "zh", "ko"]) });

router.post("/:id/comments/:commentId/translation", translateLimiter, optionalAuth, async (req, res) => {
  const parsed = commentTranslationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "翻訳先の言語が正しくありません" });
  const { lang } = parsed.data;

  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, include: commentReelInclude });
  const comment = reel
    ? await prisma.comment.findFirst({
        where: { id: req.params.commentId, reelId: reel.id },
        include: { _count: { select: { reports: true } } },
      })
    : null;
  if (!reel || !comment) return res.status(404).json({ error: "コメントが見つかりません" });
  if (comment._count.reports >= COMMENT_HIDE_THRESHOLD && comment.userId !== req.auth?.userId && !(await canModerateComments(req.auth, reel))) {
    return res.status(404).json({ error: "コメントが見つかりません" });
  }

  const cached = await prisma.commentTranslation.findUnique({ where: { commentId_lang: { commentId: comment.id, lang } } });
  if (cached) return res.json({ body: cached.body, cached: true });

  if (!isClaudeConfigured()) return res.status(503).json({ error: "翻訳機能は現在利用できません" });
  try {
    const body = await translateCaption(comment.body, lang, "comment");
    await prisma.commentTranslation.upsert({
      where: { commentId_lang: { commentId: comment.id, lang } },
      create: { commentId: comment.id, lang, body },
      update: { body },
    });
    res.json({ body, cached: false });
  } catch (err) {
    logClaudeError("translate comment", err);
    res.status(502).json({ error: "翻訳できませんでした。しばらくしてからもう一度お試しください" });
  }
});

// スタンプラリー: check in at a post's spot. The browser sends its position;
// a stamp is given only within VISIT_RADIUS_METERS of the spot (the position
// is the browser's report, so this keeps honest use honest rather than being
// tamper-proof). Travelers only — posters don't collect stamps.
const VISIT_RADIUS_METERS = 1000;
const visitSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

// ライブリアクション: an emoji floats up on the screen of everyone watching
// this reel right now (over their GET /:id/live stream). Not stored; `from`
// lets the sender's own tab skip the echo of what it already showed.
export const REACTIONS = ["heart", "wow", "clap", "fire"] as const;
const reactionSchema = z.object({
  reaction: z.enum(REACTIONS),
  client: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

router.post("/:id/react", reactionLimiter, async (req, res) => {
  const parsed = reactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "リアクションが正しくありません" });
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  sendToWatchers(reel.id, "reaction", { reaction: parsed.data.reaction, from: parsed.data.client });
  res.status(204).end();
});

// How many travelers have got this spot's stamp: today (Japan time) and in
// total. Counts only — shown on the spot page as social proof.
router.get("/:id/visits", async (req, res) => {
  const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  const startOfToday = new Date(`${todayInJapan()}T00:00:00+09:00`);
  const [today, total] = await Promise.all([
    prisma.visit.count({ where: { reelId: reel.id, createdAt: { gte: startOfToday } } }),
    prisma.visit.count({ where: { reelId: reel.id } }),
  ]);
  res.json({ today, total });
});

router.post("/:id/visit", requireAuth, requireRole("USER"), writeLimiter, async (req, res) => {
  const parsed = visitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "現在地を取得できませんでした" });
  const reel = await prisma.reel.findUnique({
    where: { id: req.params.id },
    select: { id: true, locationLat: true, locationLng: true },
  });
  if (!reel) return res.status(404).json({ error: "投稿が見つかりません" });
  if (reel.locationLat == null || reel.locationLng == null) {
    return res.status(400).json({ error: "この投稿には場所が登録されていません" });
  }
  const distance = haversineMeters(parsed.data, { lat: reel.locationLat, lng: reel.locationLng });
  if (distance > VISIT_RADIUS_METERS) {
    return res.status(422).json({ error: "tooFar", distanceMeters: Math.round(distance) });
  }
  const existing = await prisma.visit.findUnique({ where: { userId_reelId: { userId: req.auth!.userId, reelId: reel.id } } });
  const visit =
    existing ?? (await prisma.visit.create({ data: { userId: req.auth!.userId, reelId: reel.id } }));
  res.json({ visitedAt: visit.createdAt, alreadyVisited: !!existing, ...(await getUserPoints(req.auth!.userId)) });
});

export default router;
