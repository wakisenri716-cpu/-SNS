import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { resolvePosterContext } from "../lib/posterContext";
import { NotEnoughPoints, getUserPoints } from "../lib/points";
import { todayInJapan } from "./events";
import { ACTIVE_COUPONS, activePlan } from "../lib/plans";

// ポイントで交換 (see the Coupon model): municipalities and the businesses
// under them offer coupons; travelers exchange points for them and show the
// code at the counter; the issuer can look a code up and mark it used.
const router = Router();

// How many coupons an issuer can hand out at once: a few for free, many with
// ビジネス / 自治体プロ (lib/plans.ts).
async function activeCouponLimit(userId: string, role: string) {
  const limits = role === "COMPANY" ? ACTIVE_COUPONS.COMPANY : ACTIVE_COUPONS.MUNICIPALITY;
  return (await activePlan(userId)) ? limits.paid : limits.free;
}
async function overCouponLimit(req: { auth?: { userId: string; role: string } }, poster: { municipalityId: string; companyId: string | null }) {
  const [limit, active] = await Promise.all([
    activeCouponLimit(req.auth!.userId, req.auth!.role),
    prisma.coupon.count({ where: { ...issuerWhere(poster), active: true } }),
  ]);
  return active >= limit ? limit : null;
}
const couponLimitBody = async (userId: string, limit: number) => ({
  code: "planLimit",
  limit,
  error: (await activePlan(userId))
    ? `公開中のクーポンは${limit}件までです`
    : `無料プランで公開できるクーポンは${limit}件までです。有料プランにすると最大${ACTIVE_COUPONS.COMPANY.paid}件まで公開できます`,
});
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const newCode = () => {
  const c = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};
const normalizeCode = (code: string) => {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : "";
};

const issuerSelect = {
  municipality: { select: { id: true, name: true, prefecture: true } },
  company: { select: { id: true, name: true } },
  _count: { select: { redemptions: true } },
} as const;

type CouponRow = Awaited<ReturnType<typeof prisma.coupon.findFirstOrThrow<{ include: typeof issuerSelect }>>>;

const isOpen = (c: { active: boolean; validUntil: string | null }) => c.active && (!c.validUntil || c.validUntil >= todayInJapan());

function serialize(c: CouponRow, extra: Record<string, unknown> = {}) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    terms: c.terms,
    pointsCost: c.pointsCost,
    stock: c.stock,
    remaining: c.stock == null ? null : Math.max(0, c.stock - c._count.redemptions),
    perUserLimit: c.perUserLimit,
    validUntil: c.validUntil,
    active: c.active,
    open: isOpen(c),
    issuer: c.company ? { kind: "company", id: c.company.id, name: c.company.name } : { kind: "municipality", id: c.municipality.id, name: c.municipality.name },
    municipality: c.municipality,
    ...extra,
  };
}

// ---- Travelers -------------------------------------------------------------

// Coupons that can be exchanged now (optionally one municipality's), with how many you have.
router.get("/", optionalAuth, async (req, res) => {
  const municipalityId = typeof req.query.municipalityId === "string" ? req.query.municipalityId : undefined;
  const today = todayInJapan();
  const rows = await prisma.coupon.findMany({
    where: { active: true, OR: [{ validUntil: null }, { validUntil: { gte: today } }], ...(municipalityId ? { municipalityId } : {}) },
    include: issuerSelect,
    orderBy: [{ pointsCost: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const mine = req.auth
    ? await prisma.couponRedemption.groupBy({ by: ["couponId"], where: { userId: req.auth.userId, couponId: { in: rows.map((r) => r.id) } }, _count: true })
    : [];
  const mineBy = new Map(mine.map((m) => [m.couponId, m._count]));
  res.json({ items: rows.map((c) => serialize(c, { mineCount: mineBy.get(c.id) ?? 0 })).filter((c) => c.remaining !== 0) });
});

router.post("/:id/redeem", requireAuth, requireRole("USER"), writeLimiter, async (req, res) => {
  const userId = req.auth!.userId;
  const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id }, include: issuerSelect });
  if (!coupon || !isOpen(coupon)) return res.status(404).json({ error: "このクーポンは交換できません" });
  try {
    const redemption = await prisma.$transaction(async (tx) => {
      // Write first (locks), then check stock, per-person limit and balance.
      const r = await tx.couponRedemption.create({ data: { couponId: coupon.id, userId, code: newCode(), pointsSpent: coupon.pointsCost } });
      const [all, mine] = await Promise.all([tx.couponRedemption.count({ where: { couponId: coupon.id } }), tx.couponRedemption.count({ where: { couponId: coupon.id, userId } })]);
      if (coupon.stock != null && all > coupon.stock) throw new RedeemError("なくなりました");
      if (mine > coupon.perUserLimit) throw new RedeemError(`このクーポンはお一人${coupon.perUserLimit}枚までです`);
      if ((await getUserPoints(userId, tx)).points < 0) throw new NotEnoughPoints();
      return r;
    });
    res.status(201).json({ id: redemption.id, code: redemption.code, points: (await getUserPoints(userId)).points });
  } catch (err) {
    if (err instanceof NotEnoughPoints) return res.status(400).json({ code: "notEnoughPoints", error: "ポイントが足りません" });
    if (err instanceof RedeemError) return res.status(400).json({ error: err.message });
    throw err;
  }
});
class RedeemError extends Error {}

const serializeRedemption = (r: { id: string; code: string; pointsSpent: number; usedAt: Date | null; createdAt: Date; coupon: CouponRow }) => ({
  id: r.id,
  code: r.code,
  pointsSpent: r.pointsSpent,
  usedAt: r.usedAt,
  createdAt: r.createdAt,
  coupon: serialize(r.coupon),
});

// The coupons you hold: unused first, then used.
router.get("/mine", requireAuth, requireRole("USER"), async (req, res) => {
  const rows = await prisma.couponRedemption.findMany({
    where: { userId: req.auth!.userId },
    include: { coupon: { include: issuerSelect } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  rows.sort((a, b) => Number(!!a.usedAt) - Number(!!b.usedAt));
  res.json({ items: rows.map(serializeRedemption) });
});

// 使う: pressed in front of the staff. Once only; not after the last day.
router.post("/redemptions/:id/use", requireAuth, requireRole("USER"), async (req, res) => {
  const r = await prisma.couponRedemption.findFirst({ where: { id: req.params.id, userId: req.auth!.userId }, include: { coupon: true } });
  if (!r) return res.status(404).json({ error: "クーポンが見つかりません" });
  if (r.coupon.validUntil && r.coupon.validUntil < todayInJapan()) return res.status(400).json({ error: "有効期限が過ぎています" });
  const { count } = await prisma.couponRedemption.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) return res.status(400).json({ error: "このクーポンは使用済みです" });
  res.json({ usedAt: (await prisma.couponRedemption.findUniqueOrThrow({ where: { id: r.id } })).usedAt });
});

// ---- Issuers (municipality / company) -----------------------------------------

const couponSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).default(""),
  terms: z.string().trim().max(300).default(""),
  pointsCost: z.coerce.number().int().min(10).max(100_000),
  stock: z.coerce.number().int().min(1).max(100_000).nullable().default(null),
  perUserLimit: z.coerce.number().int().min(1).max(10).default(1),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

const issuerWhere = (p: { municipalityId: string; companyId: string | null }) =>
  p.companyId ? { companyId: p.companyId } : { municipalityId: p.municipalityId, companyId: null };

router.get("/issued", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  const rows = await prisma.coupon.findMany({ where: issuerWhere(poster), include: issuerSelect, orderBy: { createdAt: "desc" } });
  const used = await prisma.couponRedemption.groupBy({ by: ["couponId"], where: { couponId: { in: rows.map((r) => r.id) }, usedAt: { not: null } }, _count: true });
  const usedBy = new Map(used.map((u) => [u.couponId, u._count]));
  res.json({ items: rows.map((c) => serialize(c, { exchanged: c._count.redemptions, used: usedBy.get(c.id) ?? 0 })) });
});

router.post("/", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), writeLimiter, async (req, res) => {
  const parsed = couponSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "クーポン名と必要なポイント（10以上）を入力してください" });
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  if (parsed.data.validUntil && parsed.data.validUntil < todayInJapan()) return res.status(400).json({ error: "有効期限は今日以降にしてください" });
  const limit = await overCouponLimit(req, poster);
  if (limit != null) return res.status(400).json(await couponLimitBody(req.auth!.userId, limit));
  const created = await prisma.coupon.create({ data: { ...parsed.data, municipalityId: poster.municipalityId, companyId: poster.companyId }, include: issuerSelect });
  res.status(201).json(serialize(created, { exchanged: 0, used: 0 }));
});

// Stop (or restart) handing it out. Coupons already exchanged stay usable.
router.patch("/:id", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const poster = await resolvePosterContext(req, res);
  if (!poster) return;
  if (parsed.data.active) {
    const current = await prisma.coupon.findFirst({ where: { id: req.params.id, ...issuerWhere(poster) }, select: { active: true } });
    const limit = current && !current.active ? await overCouponLimit(req, poster) : null;
    if (limit != null) return res.status(400).json(await couponLimitBody(req.auth!.userId, limit));
  }
  const { count } = await prisma.coupon.updateMany({ where: { id: req.params.id, ...issuerWhere(poster) }, data: { active: parsed.data.active } });
  if (count === 0) return res.status(404).json({ error: "クーポンが見つかりません" });
  res.status(204).end();
});

// At the counter: look up a code shown by a traveler (only this issuer's coupons).
async function findForIssuer(req: Parameters<typeof resolvePosterContext>[0], res: Parameters<typeof resolvePosterContext>[1]) {
  const poster = await resolvePosterContext(req, res);
  if (!poster) return null;
  const code = normalizeCode(req.params.code);
  const r = code ? await prisma.couponRedemption.findUnique({ where: { code }, include: { coupon: { include: issuerSelect }, user: { select: { name: true } } } }) : null;
  const mine = r && (poster.companyId ? r.coupon.companyId === poster.companyId : r.coupon.municipalityId === poster.municipalityId && !r.coupon.companyId);
  if (!r || !mine) {
    res.status(404).json({ error: "このコードのクーポンは見つかりません（ほかのお店のクーポンかもしれません）" });
    return null;
  }
  return r;
}

router.get("/verify/:code", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const r = await findForIssuer(req, res);
  if (!r) return;
  res.json({ ...serializeRedemption(r), holder: r.user.name, expired: !!r.coupon.validUntil && r.coupon.validUntil < todayInJapan() });
});

router.post("/verify/:code/use", requireAuth, requireRole("MUNICIPALITY", "COMPANY"), async (req, res) => {
  const r = await findForIssuer(req, res);
  if (!r) return;
  if (r.coupon.validUntil && r.coupon.validUntil < todayInJapan()) return res.status(400).json({ error: "有効期限が過ぎています" });
  const { count } = await prisma.couponRedemption.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) return res.status(400).json({ error: "このクーポンは使用済みです" });
  res.json({ usedAt: (await prisma.couponRedemption.findUniqueOrThrow({ where: { id: r.id } })).usedAt });
});

export default router;
