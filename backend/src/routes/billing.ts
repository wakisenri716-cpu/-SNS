import type { Request, Response } from "express";
import { Router } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../prisma";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { ACTIVE_COUPONS, AI_MAX_PER_DAY, AI_PER_MONTH, PLANS, activePlan, getStripe, planOfPrice, priceIdOf, type PlanId } from "../lib/plans";

// 有料プラン: card payments through Stripe Checkout (Jaziba never sees the
// card), plan changes and cancellation in Stripe's customer portal, and the
// plan kept in step by Stripe's webhook. Without STRIPE_SECRET_KEY the plans
// are listed but can't be bought (the page says payments aren't set up).
const router = Router();

const appOrigin = (req: Request) => process.env.APP_ORIGIN || req.get("origin") || `${req.protocol}://${req.get("host")}`;

// The plans for this account's kind, and its current one.
router.get("/", optionalAuth, async (req, res) => {
  const stripe = getStripe();
  const current = req.auth ? await prisma.planSubscription.findUnique({ where: { userId: req.auth.userId } }) : null;
  const active = req.auth ? await activePlan(req.auth.userId) : null;
  res.json({
    paymentsReady: !!stripe,
    // What free and paid include, for the plan cards.
    limits: {
      free: { aiPerMonth: AI_PER_MONTH.free, aiPerDay: AI_MAX_PER_DAY.free, coupons: { COMPANY: ACTIVE_COUPONS.COMPANY.free, MUNICIPALITY: ACTIVE_COUPONS.MUNICIPALITY.free } },
      paid: { aiPerMonth: AI_PER_MONTH.plus, aiPerDay: AI_MAX_PER_DAY.plus, coupons: { COMPANY: ACTIVE_COUPONS.COMPANY.paid, MUNICIPALITY: ACTIVE_COUPONS.MUNICIPALITY.paid } },
    },
    plans: (Object.keys(PLANS) as PlanId[]).map((id) => ({
      id,
      role: PLANS[id].role,
      priceYen: PLANS[id].priceYen,
      // Card plans need their Stripe price; 自治体プロ is by invoice.
      purchasable: PLANS[id].priceEnv ? !!stripe && !!priceIdOf(id) : false,
    })),
    current: current
      ? {
          plan: current.plan,
          active: active === current.plan,
          status: current.status,
          source: current.source,
          currentPeriodEnd: current.currentPeriodEnd,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        }
      : null,
  });
});

const checkoutSchema = z.object({ plan: z.enum(["plus", "business"]) });

// Start paying: a Stripe Checkout page for the plan; the plan turns on when
// Stripe tells the webhook the subscription is active.
router.post("/checkout", requireAuth, writeLimiter, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "プランが正しくありません" });
  const plan = parsed.data.plan;
  if (PLANS[plan].role !== req.auth!.role) return res.status(403).json({ error: "このアカウントでは申し込めないプランです" });
  const stripe = getStripe();
  const price = priceIdOf(plan);
  if (!stripe || !price) return res.status(503).json({ code: "paymentsNotReady", error: "お支払いの準備がまだできていません" });
  if (await activePlan(req.auth!.userId)) return res.status(400).json({ error: "すでに有料プランに加入しています。変更・解約は「プランの管理」から行えます" });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { id: true, email: true, name: true, stripeCustomerId: true } });
  let customer = user.stripeCustomerId;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } })).id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer } });
  }
  const origin = appOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id, plan } },
    success_url: `${origin}/plans?checkout=success`,
    cancel_url: `${origin}/plans?checkout=cancel`,
    locale: "auto",
  });
  res.json({ url: session.url });
});

// プランの管理: Stripe's customer portal (card, receipts, change, cancel).
router.post("/portal", requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ code: "paymentsNotReady", error: "お支払いの準備がまだできていません" });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { stripeCustomerId: true } });
  if (!user.stripeCustomerId) return res.status(400).json({ error: "お支払いの記録がありません" });
  const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${appOrigin(req)}/plans` });
  res.json({ url: session.url });
});

// ---- Webhook ------------------------------------------------------------------

/** Store a Stripe subscription as the account's plan. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId =
    sub.metadata?.userId ?? (await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))?.id;
  if (!userId) return console.warn(`[billing] subscription ${sub.id}: no account for customer ${customerId}`);
  const plan = (sub.metadata?.plan as PlanId | undefined) ?? planOfPrice(sub.items.data[0]?.price?.id);
  if (!plan || !PLANS[plan]) return console.warn(`[billing] subscription ${sub.id}: unknown plan`);
  // The period now lives on the items (Stripe API 2025-03 and later).
  const ends = sub.items.data.map((i) => (i as { current_period_end?: number }).current_period_end).filter((n): n is number => typeof n === "number");
  const currentPeriodEnd = ends.length ? new Date(Math.max(...ends) * 1000) : null;
  const data = {
    plan,
    status: sub.status,
    source: "stripe",
    stripeSubscriptionId: sub.id,
    currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
  await prisma.planSubscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function stripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return res.status(503).end();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, req.get("stripe-signature") ?? "", secret);
  } catch {
    return res.status(400).json({ error: "invalid signature" });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(id));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[billing] webhook failed:", err);
    // A 500 makes Stripe send it again later.
    res.status(500).end();
  }
}

export default router;
