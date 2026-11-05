import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { estimateCostMicroUsd, isClaudeConfigured, type AiUsageInfo } from "../services/claude";
import { todayInJapan } from "../routes/events";
import { AI_MAX_PER_DAY, AI_PER_MONTH, activePlan } from "./plans";

// AIの利用回数と予算: the AI concierge, photo search and AI trip planning call
// Claude, which costs money per request.
//
// - Each feature counts for a number of uses (AI_FEATURE_UNITS): one for a
//   question or a plan, five for a whole trip made from a sentence.
// - A signed-in account gets FREE_AI_PER_MONTH uses a month (Japan time),
//   at most FREE_AI_MAX_PER_DAY of them a day — more with a paid plan
//   (lib/plans.ts); beyond that each use takes an AIチケット, bought with
//   points (routes/points.ts).
// - Visitors who aren't signed in get ANON_AI_PER_DAY uses per network address.
// - The whole app has a budget (AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD,
//   estimated from the tokens each request used): once it's spent, the
//   features answer without AI (keyword search, distance ordering) until the
//   next day or month, so the bill can't run past it.
// Nothing is counted when no Claude key is set (the features then run
// without AI and cost nothing).
export const FREE_AI_PER_MONTH = AI_PER_MONTH.free;
export const FREE_AI_MAX_PER_DAY = AI_MAX_PER_DAY.free;
export const ANON_AI_PER_DAY = 3;

export type AiFeature = "concierge" | "photoConcierge" | "tripPlan" | "tripCompose" | "transitRead" | "reservationRead";
export const AI_FEATURE_UNITS: Record<AiFeature, number> = {
  concierge: 1,
  photoConcierge: 1,
  tripPlan: 1,
  tripCompose: 5,
  // 地元の交通情報: reading a municipality's or business's file.
  transitRead: 1,
  // 予約明細: reading a pasted booking confirmation.
  reservationRead: 1,
};

export const AI_TICKET_PACKS = [
  { id: "small", credits: 10, points: 50 },
  { id: "large", credits: 30, points: 120 },
] as const;

const DEFAULT_MONTHLY_BUDGET_USD = 300;
const budgets = () => {
  const monthly = Number(process.env.AI_MONTHLY_BUDGET_USD) || DEFAULT_MONTHLY_BUDGET_USD;
  const daily = Number(process.env.AI_DAILY_BUDGET_USD) || monthly / 15;
  return { dailyMicroUsd: daily * 1_000_000, monthlyMicroUsd: monthly * 1_000_000 };
};

const startOfTodayJst = (now = new Date()) => new Date(`${todayInJapan(now)}T00:00:00+09:00`);
const startOfMonthJst = (now = new Date()) => new Date(`${todayInJapan(now).slice(0, 7)}-01T00:00:00+09:00`);

async function freeUnitsSince(userId: string, since: Date) {
  const r = await prisma.aiUsage.aggregate({ where: { userId, createdAt: { gte: since } }, _sum: { units: true, paidUnits: true } });
  return (r._sum.units ?? 0) - (r._sum.paidUnits ?? 0);
}

export async function aiAllowance(userId: string, now = new Date()) {
  const [plan, usedMonth, usedToday, purchased, paid] = await Promise.all([
    activePlan(userId, now),
    freeUnitsSince(userId, startOfMonthJst(now)),
    freeUnitsSince(userId, startOfTodayJst(now)),
    prisma.aiCreditPurchase.aggregate({ where: { userId }, _sum: { credits: true } }),
    prisma.aiUsage.aggregate({ where: { userId }, _sum: { paidUnits: true } }),
  ]);
  // Any paid plan comes with the larger AI allowance.
  const perMonth = plan ? AI_PER_MONTH.plus : AI_PER_MONTH.free;
  const maxPerDay = plan ? AI_MAX_PER_DAY.plus : AI_MAX_PER_DAY.free;
  return {
    plan,
    freePerMonth: perMonth,
    freeMaxPerDay: maxPerDay,
    freeLeftThisMonth: Math.max(0, perMonth - usedMonth),
    freeLeft: Math.max(0, Math.min(perMonth - usedMonth, maxPerDay - usedToday)),
    credits: Math.max(0, (purchased._sum.credits ?? 0) - (paid._sum.paidUnits ?? 0)),
    units: AI_FEATURE_UNITS,
  };
}

/** Today's and this month's estimated AI spend against the budgets (admin console). */
export async function aiSpend(now = new Date()) {
  const { dailyMicroUsd, monthlyMicroUsd } = budgets();
  const [today, month, byFeature] = await Promise.all([
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfTodayJst(now) } }, _sum: { costMicroUsd: true, units: true } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfMonthJst(now) } }, _sum: { costMicroUsd: true, units: true }, _count: true }),
    prisma.aiUsage.groupBy({ by: ["feature"], where: { createdAt: { gte: startOfMonthJst(now) } }, _sum: { costMicroUsd: true, units: true }, _count: true }),
  ]);
  return {
    todayMicroUsd: today._sum.costMicroUsd ?? 0,
    todayUnits: today._sum.units ?? 0,
    monthMicroUsd: month._sum.costMicroUsd ?? 0,
    monthUnits: month._sum.units ?? 0,
    monthRequests: month._count,
    dailyBudgetMicroUsd: dailyMicroUsd,
    monthlyBudgetMicroUsd: monthlyMicroUsd,
    byFeature: byFeature.map((f) => ({ feature: f.feature, requests: f._count, units: f._sum.units ?? 0, microUsd: f._sum.costMicroUsd ?? 0 })),
  };
}

/** Whether the app's AI budget for today and this month still has room. */
export async function aiBudgetLeft(now = new Date()) {
  const { dailyMicroUsd, monthlyMicroUsd } = budgets();
  const [today, month] = await Promise.all([
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfTodayJst(now) } }, _sum: { costMicroUsd: true } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfMonthJst(now) } }, _sum: { costMicroUsd: true } }),
  ]);
  return (today._sum.costMicroUsd ?? 0) < dailyMicroUsd && (month._sum.costMicroUsd ?? 0) < monthlyMicroUsd;
}

// Visitors: counted in memory per address and day (resets with the server).
const anonymous = new Map<string, number>();
let anonymousDay = "";
function anonymousKey(req: Request) {
  const day = todayInJapan();
  if (day !== anonymousDay) {
    anonymous.clear();
    anonymousDay = day;
  }
  return req.ip ?? "unknown";
}

/**
 * Before an AI request. "ai": go ahead. "noAi": answer without AI (no key,
 * or the app's budget is spent — not the traveler's doing, so no refusal).
 * "refused": this account's free uses and tickets don't cover it — a 402
 * (code "aiLimit") has been sent.
 */
export async function checkAiQuota(req: Request, res: Response, feature: AiFeature): Promise<"ai" | "noAi" | "refused"> {
  if (!isClaudeConfigured()) return "noAi";
  if (!(await aiBudgetLeft())) return "noAi";
  const units = AI_FEATURE_UNITS[feature];
  if (!req.auth) {
    if ((anonymous.get(anonymousKey(req)) ?? 0) + units <= ANON_AI_PER_DAY) return "ai";
    res.status(402).json({
      code: "aiLimit",
      signedIn: false,
      error: `ログインしていない場合のAIは1日${ANON_AI_PER_DAY}回までです。ログインすると月${FREE_AI_PER_MONTH}回まで無料で使え、ポイントでAIチケットと交換もできます`,
    });
    return "refused";
  }
  const a = await aiAllowance(req.auth.userId);
  if (a.freeLeft + a.credits >= units) return "ai";
  const kind = a.plan ? "プランの" : "無料の";
  const more = a.plan ? "ポイントで「AIチケット」と交換すると続けて使えます" : "ポイントで「AIチケット」と交換するか、有料プランにすると続けて使えます";
  res.status(402).json({
    code: "aiLimit",
    signedIn: true,
    units,
    plan: a.plan,
    error:
      a.freeLeftThisMonth > 0
        ? `今日の${kind}AI（1日${a.freeMaxPerDay}回まで）を使い切りました。明日また使えます。${more}`
        : `今月の${kind}AI（${a.freePerMonth}回）を使い切りました。${more}`,
  });
  return "refused";
}

/** After a request that really used the AI: log it, free uses first, then tickets. */
export async function recordAiUse(req: Request, feature: AiFeature, usage?: AiUsageInfo) {
  if (!isClaudeConfigured()) return;
  const units = AI_FEATURE_UNITS[feature];
  const tokens = usage
    ? {
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        costMicroUsd: estimateCostMicroUsd(usage),
      }
    : {};
  if (!req.auth) {
    const key = anonymousKey(req);
    anonymous.set(key, (anonymous.get(key) ?? 0) + units);
    await prisma.aiUsage.create({ data: { userId: null, feature, units, ...tokens } });
    return;
  }
  const a = await aiAllowance(req.auth.userId);
  const paidUnits = Math.max(0, units - a.freeLeft);
  await prisma.aiUsage.create({ data: { userId: req.auth.userId, feature, units, paidUnits, ...tokens } });
}

export function resetAnonymousAiUse() {
  anonymous.clear();
}
