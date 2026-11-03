import Stripe from "stripe";
import { prisma } from "../prisma";

// 有料プラン. Prices are shown in the app from here; the amount charged is the
// Stripe Price whose id is in the env var named — keep the two the same.
// 自治体プロ has no Stripe price: municipalities pay by invoice, and the
// operator turns it on after the contract (npm run plan:grant).
export type PlanId = "plus" | "business" | "municipalityPro";
export type Role = "USER" | "MUNICIPALITY" | "COMPANY";

export const PLANS: Record<PlanId, { role: Role; priceYen: number | null; priceEnv: string | null }> = {
  plus: { role: "USER", priceYen: 480, priceEnv: "STRIPE_PRICE_PLUS" },
  business: { role: "COMPANY", priceYen: 2000, priceEnv: "STRIPE_PRICE_BUSINESS" },
  municipalityPro: { role: "MUNICIPALITY", priceYen: null, priceEnv: null },
};

// What each plan unlocks (the free row is everyone else).
export const AI_PER_MONTH = { free: 30, plus: 300 } as const;
export const AI_MAX_PER_DAY = { free: 10, plus: 50 } as const;
export const ACTIVE_COUPONS = {
  COMPANY: { free: 1, paid: 50 },
  MUNICIPALITY: { free: 3, paid: 50 },
} as const;

/** A failed renewal keeps the plan this long while Stripe retries the card. */
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** The account's plan while it's paid for (or within the grace period), else null. */
export async function activePlan(userId: string, now = new Date()): Promise<PlanId | null> {
  const s = await prisma.planSubscription.findUnique({ where: { userId } });
  if (!s) return null;
  const live = s.status === "active" || s.status === "trialing" || s.status === "past_due";
  const until = s.currentPeriodEnd ? s.currentPeriodEnd.getTime() + (s.status === "past_due" ? GRACE_MS : 0) : Infinity;
  return live && until > now.getTime() ? (s.plan as PlanId) : null;
}

// ---- Stripe -------------------------------------------------------------------

let stripe: Stripe | null | undefined;

/** The Stripe client, or null when STRIPE_SECRET_KEY isn't set (payments then can't start). */
export function getStripe(): Stripe | null {
  if (stripe === undefined) stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  return stripe;
}

/** Tests replace the client with a fake. */
export function setStripeForTests(fake: unknown) {
  stripe = fake as Stripe | null;
}

export const priceIdOf = (plan: PlanId) => {
  const env = PLANS[plan].priceEnv;
  return env ? process.env[env] || null : null;
};

/** Which plan a Stripe price is (from the env vars). */
export const planOfPrice = (priceId: string | null | undefined): PlanId | null =>
  (Object.keys(PLANS) as PlanId[]).find((p) => priceId && priceIdOf(p) === priceId) ?? null;

// ---- Plans by invoice -------------------------------------------------------------

export class PlanGrantError extends Error {}

/**
 * Turn a plan on for `months` from today, or off ("none"), without Stripe:
 * for 自治体プロ by invoice, or a plan the operator gives. Card plans are
 * Stripe's to change.
 */
export async function grantPlan(userId: string, plan: PlanId | "none", months = 12) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw new PlanGrantError("アカウントが見つかりません");
  const existing = await prisma.planSubscription.findUnique({ where: { userId } });
  const stripeLive = existing?.source === "stripe" && !["canceled", "incomplete_expired"].includes(existing.status);
  if (stripeLive) throw new PlanGrantError("カード払いのプランです。Stripeのダッシュボードから変更・解約してください");
  if (plan === "none") {
    await prisma.planSubscription.deleteMany({ where: { userId } });
    return null;
  }
  if (!PLANS[plan]) throw new PlanGrantError("不明なプランです");
  if (PLANS[plan].role !== user.role) throw new PlanGrantError("このアカウントの種類では使えないプランです");
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new PlanGrantError("月数は1〜60で指定してください");
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + months);
  const data = { plan, status: "active", source: "invoice", stripeSubscriptionId: null, currentPeriodEnd, cancelAtPeriodEnd: false };
  return prisma.planSubscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}
