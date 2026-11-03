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
