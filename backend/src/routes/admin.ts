import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { isAdminEmail, logAdmin, requireAdmin, setApproval, setSuspended } from "../lib/admin";
import { sendPush } from "../lib/push";
import { PLANS, PlanGrantError, activePlan, grantPlan, type PlanId } from "../lib/plans";
import { aiSpend } from "../lib/aiQuota";
import { todayInJapan } from "./events";
import { serialize as serializeSubmission } from "./submissions";
import { POINTS_PER_SUBMISSION } from "../lib/points";
import { uploadVideo } from "../middleware/upload";
import { announceNewPost } from "../lib/presence";
import { REEL_CATEGORIES } from "../types";

// 管理者サイト (/admin) API: for the operator only (ADMIN_EMAILS). Every
// change is written to the AdminLog.
const router = Router();
router.use(requireAuth, requireAdmin);

const DAY = 86_400_000;
const jstDay = (d: Date) => todayInJapan(d);

router.get("/me", (req, res) => res.json({ admin: true, name: req.admin!.name }));

// ---- 概要 ------------------------------------------------------------------------

router.get("/overview", async (_req, res) => {
  const now = new Date();
  const since14 = new Date(now.getTime() - 14 * DAY);
  const people = { NOT: { municipality: { listing: true } } };
  const [roles, newUsers7d, suspended, recentSignups, reels, comments, visits30d, pendingSubmissions, inquiriesOpen, reported, plans, ai, logs, pendingApprovals] =
    await Promise.all([
      // Unofficial listing pages (nobody signs in to them) aren't counted as accounts.
      prisma.user.groupBy({ by: ["role"], where: people, _count: true }),
      prisma.user.count({ where: { ...people, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      prisma.user.count({ where: { suspendedAt: { not: null } } }),
      prisma.user.findMany({ where: { ...people, createdAt: { gte: since14 } }, select: { createdAt: true } }),
      prisma.reel.count(),
      prisma.comment.count(),
      prisma.visit.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
      // The towns' own review queue; the unofficial pages' queue is the operator's (below).
      prisma.submission.count({ where: { status: "pending", municipality: { listing: false } } }),
      prisma.inquiry.count({ where: { handledAt: null } }),
      prisma.comment.count({ where: { reports: { some: {} } } }),
      prisma.planSubscription.findMany({ select: { plan: true, status: true, source: true, currentPeriodEnd: true, userId: true } }),
      aiSpend(now),
      prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.user.count({ where: { approval: "pending" } }),
    ]);
  const [listingPages, pendingListingSubmissions] = await Promise.all([
    prisma.municipality.count({ where: { listing: true } }),
    prisma.submission.count({ where: { status: "pending", municipality: { listing: true } } }),
  ]);

  // Sign-ups per day for the last 14 days (Japan time).
  const days = Array.from({ length: 14 }, (_, i) => jstDay(new Date(now.getTime() - (13 - i) * DAY)));
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const u of recentSignups) {
    const d = jstDay(u.createdAt);
    if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1);
  }

  // Paid plans in force now, and the monthly card revenue they mean.
  const active = (await Promise.all(plans.map(async (p) => ((await activePlan(p.userId, now)) ? p : null)))).filter((p) => p != null);
  const count = (plan: PlanId) => active.filter((p) => p.plan === plan).length;
  const monthlyYen = active.filter((p) => p.source === "stripe").reduce((sum, p) => sum + (PLANS[p.plan as PlanId]?.priceYen ?? 0), 0);

  res.json({
    users: {
      byRole: Object.fromEntries(roles.map((r) => [r.role, r._count])),
      total: roles.reduce((s, r) => s + r._count, 0),
      new7d: newUsers7d,
      suspended,
      signupsByDay: days.map((d) => ({ day: d, count: perDay.get(d)! })),
    },
    content: { reels, comments, visits30d },
    todo: { pendingSubmissions, inquiriesOpen, reportedComments: reported, pendingApprovals, pendingListingSubmissions },
    listingPages,
    plans: { plus: count("plus"), business: count("business"), municipalityPro: count("municipalityPro"), monthlyYen },
    ai,
    recentLogs: logs,
  });
});

// ---- 連携の状況 ---------------------------------------------------------------------

// Which outside services the server is set up for (never the values), so
// the operator can see what's missing after changing Render's settings.
router.get("/integrations", async (_req, res) => {
  const set = (name: string) => !!process.env[name]?.trim();
  const rakuten = await import("../services/rakutenTravel");
  res.json({
    items: [
      { id: "rakuten", ready: rakuten.isRakutenConfigured(), parts: { appId: !!rakuten.rakutenAppId(), accessKey: !!rakuten.rakutenAccessKey(), affiliateId: !!rakuten.rakutenAffiliateId() } },
      { id: "anthropic", ready: set("ANTHROPIC_API_KEY"), parts: {} },
      { id: "stripe", ready: set("STRIPE_SECRET_KEY") && set("STRIPE_WEBHOOK_SECRET"), parts: { secretKey: set("STRIPE_SECRET_KEY"), webhookSecret: set("STRIPE_WEBHOOK_SECRET"), pricePlus: set("STRIPE_PRICE_PLUS"), priceBusiness: set("STRIPE_PRICE_BUSINESS") } },
      { id: "googleMaps", ready: set("GOOGLE_MAPS_API_KEY"), parts: {} },
    ],
  });
});

// ---- お問い合わせ ----------------------------------------------------------------

router.get("/inquiries", async (req, res) => {
  const done = req.query.status === "done";
  const items = await prisma.inquiry.findMany({ where: { handledAt: done ? { not: null } : null }, orderBy: { createdAt: done ? "desc" : "asc" }, take: 200 });
  res.json({ items });
});

router.patch("/inquiries/:id", async (req, res) => {
  const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const { count } = await prisma.inquiry.updateMany({ where: { id: req.params.id }, data: { handledAt: parsed.data.done ? new Date() : null } });
  if (count === 0) return res.status(404).json({ error: "見つかりません" });
  await logAdmin(req, parsed.data.done ? "inquiryDone" : "inquiryOpen", req.params.id);
  res.status(204).end();
});

// ---- ユーザー ----------------------------------------------------------------------

const PAGE = 50;

router.get("/users", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const role = typeof req.query.role === "string" && ["USER", "MUNICIPALITY", "COMPANY"].includes(req.query.role) ? req.query.role : undefined;
  const page = Math.max(0, Number(req.query.page) || 0);
  const where = {
    ...(req.query.listings === "1" ? { municipality: { listing: true } } : { NOT: { municipality: { listing: true } } }),
    ...(role ? { role } : {}),
    ...(req.query.suspended === "1" ? { suspendedAt: { not: null } } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { municipality: { name: { contains: q } } }, { company: { name: { contains: q } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * PAGE,
      take: PAGE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        suspendedAt: true,
        municipality: { select: { id: true, name: true, prefecture: true, listing: true } },
        company: { select: { id: true, name: true, municipality: { select: { name: true } } } },
        planSubscription: true,
        _count: { select: { comments: true, visits: true, submissions: true } },
      },
    }),
  ]);
  const items = await Promise.all(
    rows.map(async (u) => ({
      ...u,
      isAdmin: isAdminEmail(u.email),
      plan: u.planSubscription
        ? { ...u.planSubscription, active: (await activePlan(u.id)) === u.planSubscription.plan }
        : null,
      planSubscription: undefined,
    }))
  );
  res.json({ total, page, pageSize: PAGE, items });
});

router.post("/users/:id/suspend", async (req, res) => {
  const parsed = z.object({ suspended: z.boolean(), reason: z.string().trim().max(300).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, email: true } });
  if (!user) return res.status(404).json({ error: "見つかりません" });
  if (user.id === req.admin!.id || isAdminEmail(user.email)) return res.status(400).json({ error: "管理者のアカウントは停止できません" });
  await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: parsed.data.suspended ? new Date() : null } });
  setSuspended(user.id, parsed.data.suspended);
  await logAdmin(req, parsed.data.suspended ? "suspend" : "unsuspend", user.id, `${user.name}${parsed.data.reason ? `：${parsed.data.reason}` : ""}`);
  res.status(204).end();
});

router.post("/users/:id/plan", async (req, res) => {
  const parsed = z
    .object({ plan: z.enum(["plus", "business", "municipalityPro", "none"]), months: z.coerce.number().int().min(1).max(60).default(12) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "プランと月数を確認してください" });
  try {
    const result = await grantPlan(req.params.id, parsed.data.plan as PlanId | "none", parsed.data.months);
    await logAdmin(req, "plan", req.params.id, result ? `${parsed.data.plan}（${parsed.data.months}か月）` : "プランを外す");
    res.json({ plan: result });
  } catch (err) {
    if (err instanceof PlanGrantError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// ---- 登録の承認 ----------------------------------------------------------------------

// Municipality and company sign-ups: waiting ones oldest first, or the ones decided.
router.get("/approvals", async (req, res) => {
  const status = req.query.status === "approved" || req.query.status === "rejected" ? req.query.status : "pending";
  const rows = await prisma.user.findMany({
    where: { role: { in: ["MUNICIPALITY", "COMPANY"] }, approval: status, ...(status === "pending" ? {} : { reviewedAt: { not: null } }) },
    orderBy: status === "pending" ? { createdAt: "asc" } : { reviewedAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      approval: true,
      approvalNote: true,
      reviewedAt: true,
      municipality: { select: { id: true, name: true, prefecture: true } },
      company: { select: { id: true, name: true, municipality: { select: { id: true, name: true, prefecture: true } } } },
    },
  });
  // Clues for checking: other pages with the same town name (a listing made
  // from public data, or another account), and whether the address is on an
  // official local-government domain (.lg.jp).
  const items = await Promise.all(
    rows.map(async (u) => {
      const domain = u.email.split("@")[1]?.toLowerCase() ?? "";
      const sameName = u.municipality
        ? await prisma.municipality.findMany({
            where: { name: u.municipality.name, prefecture: u.municipality.prefecture, id: { not: u.municipality.id } },
            select: { id: true, listing: true, user: { select: { approval: true } } },
          })
        : [];
      return {
        ...u,
        emailDomain: domain,
        officialDomain: domain.endsWith(".lg.jp"),
        sameName: sameName.map((m) => ({ id: m.id, listing: m.listing, approved: m.user.approval === "approved" })),
      };
    })
  );
  res.json({ items });
});

router.post("/approvals/:userId", async (req, res) => {
  const parsed = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, name: true, role: true } });
  if (!user || user.role === "USER") return res.status(404).json({ error: "見つかりません" });
  const approval = parsed.data.decision === "approve" ? "approved" : "rejected";
  await prisma.user.update({ where: { id: user.id }, data: { approval, approvalNote: parsed.data.note, reviewedAt: new Date() } });
  setApproval(user.id, approval);
  await logAdmin(req, parsed.data.decision, user.id, `${user.name}${parsed.data.note ? `：${parsed.data.note}` : ""}`);
  void sendPush([user.id], { type: "accountReviewed", approved: approval === "approved", path: user.role === "MUNICIPALITY" ? "/dashboard" : "/company-dashboard" });
  res.status(204).end();
});

// ---- 非公式ページへの提供素材 --------------------------------------------------------

// Photos and videos travelers offered to an unofficial (listing) page: nobody
// runs those pages, so the operator approves them (the contributor earns
// points as usual) and can post them as Jaziba's introduction of the town.
const SUB_STATUSES = ["pending", "approved", "posted", "rejected"] as const;
const listingSubmission = { municipality: { listing: true } } as const;
const subInclude = { user: { select: { id: true, name: true } }, municipality: { select: { id: true, name: true, prefecture: true } } } as const;

router.get("/submissions", async (req, res) => {
  const status = SUB_STATUSES.includes(req.query.status as (typeof SUB_STATUSES)[number]) ? (req.query.status as (typeof SUB_STATUSES)[number]) : "pending";
  const where =
    status === "posted"
      ? { ...listingSubmission, reelId: { not: null } }
      : status === "approved"
        ? { ...listingSubmission, status: "approved", reelId: null }
        : { ...listingSubmission, status };
  const [rows, pending, approved] = await Promise.all([
    prisma.submission.findMany({ where, orderBy: { createdAt: status === "pending" ? "asc" : "desc" }, take: 100, include: subInclude }),
    prisma.submission.count({ where: { ...listingSubmission, status: "pending" } }),
    prisma.submission.count({ where: { ...listingSubmission, status: "approved", reelId: null } }),
  ]);
  res.json({ items: rows.map((r) => serializeSubmission(r, { forReviewer: true })), counts: { pending, approved }, pointsPerApproval: POINTS_PER_SUBMISSION });
});

async function reviewListingSubmission(id: string, approved: boolean, note: string) {
  // Only pending ones; conditional, so a double click can't award twice.
  const { count } = await prisma.submission.updateMany({
    where: { id, status: "pending", ...listingSubmission },
    data: { status: approved ? "approved" : "rejected", reviewNote: approved ? "" : note, reviewedAt: new Date() },
  });
  if (count === 0) return null;
  const s = await prisma.submission.findUniqueOrThrow({ where: { id }, include: subInclude });
  void sendPush([s.userId], { type: "submissionReviewed", approved, municipality: s.municipality.name, points: POINTS_PER_SUBMISSION, submissionId: s.id });
  return s;
}

for (const [path, approved] of [["approve", true], ["reject", false]] as const) {
  router.post(`/submissions/:id/${path}`, async (req, res) => {
    const note = z.object({ note: z.string().trim().max(300).default("") }).safeParse(req.body ?? {});
    const s = await reviewListingSubmission(req.params.id, approved, note.success ? note.data.note : "");
    if (!s) return res.status(404).json({ error: "審査待ちの提供が見つかりません" });
    await logAdmin(req, approved ? "approveSubmission" : "rejectSubmission", s.id, `${s.municipality.prefecture}${s.municipality.name}・${s.user.name}`);
    res.json(serializeSubmission(s, { forReviewer: true }));
  });
}

// Post an approved one as Jaziba's introduction of the town (editorial,
// crediting the contributor if they asked). A photo comes as the video made
// from it on the operator's device, like a municipality's own posting.
const postSchema = z.object({
  caption: z.string().trim().max(2000).default(""),
  category: z.enum(REEL_CATEGORIES).default("nature"),
  locationName: z.string().trim().max(200).default(""),
  // Chosen with 場所を選ぶ; else where the submission says it was taken.
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
});
router.post("/submissions/:id/post", uploadVideo.single("video"), async (req, res) => {
  const parsed = postSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const s = await prisma.submission.findFirst({ where: { id: req.params.id, status: "approved", reelId: null, ...listingSubmission }, include: subInclude });
  if (!s) return res.status(404).json({ error: "投稿できる提供素材が見つかりません" });
  if (s.kind === "photo" && !req.file) return res.status(400).json({ error: "写真から作った動画がありません" });
  const reel = await prisma.reel.create({
    data: {
      municipalityId: s.municipality.id,
      videoUrl: req.file ? `/uploads/${req.file.filename}` : s.fileUrl,
      submission: { connect: { id: s.id } },
      editorial: true,
      caption: parsed.data.caption || s.description,
      category: parsed.data.category,
      locationName: parsed.data.locationName || s.locationName || s.municipality.name,
      ...(parsed.data.locationLat != null && parsed.data.locationLng != null
        ? { locationLat: parsed.data.locationLat, locationLng: parsed.data.locationLng }
        : { locationLat: s.locationLat, locationLng: s.locationLng }),
    },
  });
  await prisma.notification.create({ data: { recipientId: s.userId, type: "submissionPosted", reelId: reel.id } });
  void sendPush([s.userId], { type: "submissionPosted", municipality: s.municipality.name, place: reel.locationName || reel.caption.slice(0, 40), reelId: reel.id });
  announceNewPost(reel.id);
  await logAdmin(req, "postSubmission", reel.id, `${s.municipality.prefecture}${s.municipality.name}・${s.user.name}`);
  res.status(201).json({ reelId: reel.id });
});

// ---- 通報されたコメント ----------------------------------------------------------

router.get("/reports", async (_req, res) => {
  const rows = await prisma.comment.findMany({
    where: { reports: { some: {} } },
    include: {
      user: { select: { id: true, name: true, suspendedAt: true } },
      reel: { select: { id: true, locationName: true, municipality: { select: { name: true } } } },
      reports: { select: { reason: true, createdAt: true } },
    },
    take: 200,
  });
  rows.sort((a, b) => b.reports.length - a.reports.length);
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user,
      reel: c.reel,
      reports: c.reports.length,
      reasons: Object.fromEntries(["spam", "abuse", "other"].map((r) => [r, c.reports.filter((x) => x.reason === r).length])),
      lastReportedAt: c.reports.reduce((d, r) => (r.createdAt > d ? r.createdAt : d), new Date(0)),
    })),
  });
});

// Not a problem: the reports go, the comment stays.
router.post("/reports/:commentId/dismiss", async (req, res) => {
  const { count } = await prisma.commentReport.deleteMany({ where: { commentId: req.params.commentId } });
  if (count === 0) return res.status(404).json({ error: "見つかりません" });
  await logAdmin(req, "dismissReports", req.params.commentId);
  res.status(204).end();
});

router.delete("/comments/:id", async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id }, select: { id: true, body: true } });
  if (!comment) return res.status(404).json({ error: "見つかりません" });
  await prisma.comment.delete({ where: { id: comment.id } });
  await logAdmin(req, "deleteComment", comment.id, comment.body.slice(0, 120));
  res.status(204).end();
});

// ---- 操作の記録 ----------------------------------------------------------------------

router.get("/logs", async (_req, res) => {
  res.json({ items: await prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }) });
});

export default router;
