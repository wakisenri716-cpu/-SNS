import fs from "node:fs";
import path from "node:path";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { submissionLimiter, writeLimiter } from "../middleware/rateLimit";
import { UPLOAD_DIR, isVideoMime, uploadMedia } from "../middleware/upload";
import { POINTS_PER_SUBMISSION } from "../lib/points";
import { sendPush } from "../lib/push";

// 素材の提供 (see the Submission model): travelers offer their own photos and
// videos to a municipality; the municipality approves (the contributor earns
// POINTS_PER_SUBMISSION) or passes, and can then post an approved one
// (POST /api/reels with submissionId, routes/reels.ts).
const router = Router();

const MAX_PENDING_PER_MUNICIPALITY = 20;

const createSchema = z.object({
  municipalityId: z.string().min(1),
  description: z.string().trim().max(500).default(""),
  locationName: z.string().trim().max(200).default(""),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
  takenAt: z.coerce.date().optional(),
  credit: z.enum(["0", "1"]).default("1"),
  // The contributor confirms it's their own and may be used in posts.
  consent: z.literal("1"),
});

type Row = Awaited<ReturnType<typeof prisma.submission.findFirstOrThrow>> & {
  user?: { id: string; name: string };
  municipality?: { id: string; name: string; prefecture: string };
};

function serialize(s: Row, { forReviewer }: { forReviewer: boolean }) {
  return {
    id: s.id,
    kind: s.kind,
    fileUrl: s.fileUrl,
    description: s.description,
    locationName: s.locationName,
    locationLat: s.locationLat,
    locationLng: s.locationLng,
    takenAt: s.takenAt,
    credit: s.credit,
    status: s.status,
    reviewNote: s.reviewNote,
    reviewedAt: s.reviewedAt,
    reelId: s.reelId,
    createdAt: s.createdAt,
    points: s.status === "approved" ? POINTS_PER_SUBMISSION : 0,
    ...(s.municipality ? { municipality: s.municipality } : {}),
    // The municipality sees who sent it (to credit them), never their email.
    ...(forReviewer && s.user ? { contributor: { id: s.user.id, name: s.user.name } } : {}),
  };
}

const removeFile = (url: string) => fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});

router.post("/", requireAuth, requireRole("USER"), submissionLimiter, uploadMedia.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "写真か動画を選んでください" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    removeFile(req.file.filename);
    const consent = parsed.error.issues.some((i) => i.path[0] === "consent");
    return res.status(400).json({ error: consent ? "ご自身で撮影したものであることと、投稿に使うことへの同意が必要です" : "入力内容を確認してください" });
  }
  const d = parsed.data;
  const municipality = await prisma.municipality.findUnique({ where: { id: d.municipalityId }, select: { id: true, name: true, prefecture: true } });
  if (!municipality) {
    removeFile(req.file.filename);
    return res.status(404).json({ error: "自治体が見つかりません" });
  }
  const pending = await prisma.submission.count({ where: { userId: req.auth!.userId, municipalityId: municipality.id, status: "pending" } });
  if (pending >= MAX_PENDING_PER_MUNICIPALITY) {
    removeFile(req.file.filename);
    return res.status(400).json({ error: `審査待ちの提供は1つの自治体に${MAX_PENDING_PER_MUNICIPALITY}件までです` });
  }
  const hasCoords = d.locationLat != null && d.locationLng != null;
  const created = await prisma.submission.create({
    data: {
      userId: req.auth!.userId,
      municipalityId: municipality.id,
      kind: isVideoMime(req.file.mimetype) ? "video" : "photo",
      fileUrl: `/uploads/${req.file.filename}`,
      description: d.description,
      locationName: d.locationName,
      locationLat: hasCoords ? d.locationLat : null,
      locationLng: hasCoords ? d.locationLng : null,
      takenAt: d.takenAt,
      credit: d.credit === "1",
    },
  });
  res.status(201).json(serialize({ ...created, municipality }, { forReviewer: false }));
});

// The traveler's own submissions, newest first, with their state and points.
router.get("/mine", requireAuth, requireRole("USER"), async (req, res) => {
  const rows = await prisma.submission.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { municipality: { select: { id: true, name: true, prefecture: true } } },
  });
  res.json({ items: rows.map((s) => serialize(s, { forReviewer: false })), pointsPerApproval: POINTS_PER_SUBMISSION });
});

// Withdraw one still waiting for review (its file goes too).
router.delete("/:id", requireAuth, requireRole("USER"), async (req, res) => {
  const s = await prisma.submission.findFirst({ where: { id: req.params.id, userId: req.auth!.userId } });
  if (!s) return res.status(404).json({ error: "見つかりません" });
  if (s.status !== "pending") return res.status(400).json({ error: "審査が終わった提供は取り下げられません" });
  await prisma.submission.delete({ where: { id: s.id } });
  removeFile(s.fileUrl);
  res.status(204).end();
});

// ---- The municipality's side ------------------------------------------------

async function myMunicipality(userId: string) {
  return prisma.municipality.findUnique({ where: { userId }, select: { id: true, name: true } });
}

const STATUSES = ["pending", "approved", "rejected", "posted"] as const;

router.get("/inbox", requireAuth, requireRole("MUNICIPALITY"), async (req, res) => {
  const m = await myMunicipality(req.auth!.userId);
  if (!m) return res.status(404).json({ error: "自治体プロフィールが見つかりません" });
  const status = STATUSES.includes(req.query.status as (typeof STATUSES)[number]) ? (req.query.status as (typeof STATUSES)[number]) : "pending";
  const where =
    status === "posted"
      ? { municipalityId: m.id, reelId: { not: null } }
      : status === "approved"
        ? { municipalityId: m.id, status: "approved", reelId: null }
        : { municipalityId: m.id, status };
  const [rows, pending, approved] = await Promise.all([
    prisma.submission.findMany({ where, orderBy: { createdAt: status === "pending" ? "asc" : "desc" }, take: 100, include: { user: { select: { id: true, name: true } } } }),
    prisma.submission.count({ where: { municipalityId: m.id, status: "pending" } }),
    prisma.submission.count({ where: { municipalityId: m.id, status: "approved", reelId: null } }),
  ]);
  res.json({ items: rows.map((s) => serialize(s, { forReviewer: true })), counts: { pending, approved }, pointsPerApproval: POINTS_PER_SUBMISSION });
});

const reviewSchema = z.object({ note: z.string().trim().max(300).default("") });

async function review(req: Request, approved: boolean) {
  const m = await myMunicipality(req.auth!.userId);
  if (!m) return { status: 404, error: "自治体プロフィールが見つかりません" } as const;
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return { status: 400, error: "入力内容を確認してください" } as const;
  // Only pending ones; the update is conditional so a double click can't award twice.
  const { count } = await prisma.submission.updateMany({
    where: { id: req.params.id, municipalityId: m.id, status: "pending" },
    data: { status: approved ? "approved" : "rejected", reviewNote: approved ? "" : parsed.data.note, reviewedAt: new Date() },
  });
  if (count === 0) return { status: 404, error: "審査待ちの提供が見つかりません" } as const;
  const s = await prisma.submission.findUniqueOrThrow({ where: { id: req.params.id }, include: { user: { select: { id: true, name: true } } } });
  void sendPush([s.userId], { type: "submissionReviewed", approved, municipality: m.name, points: POINTS_PER_SUBMISSION, submissionId: s.id });
  return { status: 200, body: serialize(s, { forReviewer: true }) } as const;
}

router.post("/:id/approve", requireAuth, requireRole("MUNICIPALITY"), writeLimiter, async (req, res) => {
  const r = await review(req, true);
  if ("error" in r) return res.status(r.status).json({ error: r.error });
  res.json(r.body);
});

router.post("/:id/reject", requireAuth, requireRole("MUNICIPALITY"), writeLimiter, async (req, res) => {
  const r = await review(req, false);
  if ("error" in r) return res.status(r.status).json({ error: r.error });
  res.json(r.body);
});

export default router;
