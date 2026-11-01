import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { isClaudeConfigured } from "../services/claude";
import { todayInJapan } from "../routes/events";

// AIの利用回数: the AI concierge, photo search and AI trip planning call
// Claude, which costs money per request. Each signed-in account gets
// FREE_AI_PER_DAY a day (Japan time); beyond that each request uses one
// AIチケット, bought with points (routes/points.ts). Visitors who aren't signed
// in get ANON_AI_PER_DAY per network address. Nothing is counted when no
// Claude key is set (the features then run without AI and cost nothing).
export const FREE_AI_PER_DAY = 5;
export const ANON_AI_PER_DAY = 3;
export const AI_TICKET_PACKS = [
  { id: "small", credits: 10, points: 50 },
  { id: "large", credits: 30, points: 120 },
] as const;

export type AiFeature = "concierge" | "photoConcierge" | "tripPlan" | "tripCompose";

const startOfTodayJst = () => new Date(`${todayInJapan()}T00:00:00+09:00`);

export async function aiAllowance(userId: string) {
  const [freeUsed, purchased, paidUsed] = await Promise.all([
    prisma.aiUsage.count({ where: { userId, paid: false, createdAt: { gte: startOfTodayJst() } } }),
    prisma.aiCreditPurchase.aggregate({ where: { userId }, _sum: { credits: true } }),
    prisma.aiUsage.count({ where: { userId, paid: true } }),
  ]);
  return {
    freePerDay: FREE_AI_PER_DAY,
    freeLeft: Math.max(0, FREE_AI_PER_DAY - freeUsed),
    credits: Math.max(0, (purchased._sum.credits ?? 0) - paidUsed),
  };
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
 * Before an AI request: whether it may go ahead. Sends 402 (with code
 * "aiLimit") and returns false when today's free uses and the tickets are
 * used up.
 */
export async function checkAiQuota(req: Request, res: Response) {
  if (!isClaudeConfigured()) return true;
  if (!req.auth) {
    if ((anonymous.get(anonymousKey(req)) ?? 0) < ANON_AI_PER_DAY) return true;
    res.status(402).json({ code: "aiLimit", signedIn: false, error: `ログインしていない場合のAIは1日${ANON_AI_PER_DAY}回までです。ログインすると1日${FREE_AI_PER_DAY}回まで無料で使え、ポイントでAIチケットと交換もできます` });
    return false;
  }
  const a = await aiAllowance(req.auth.userId);
  if (a.freeLeft > 0 || a.credits > 0) return true;
  res.status(402).json({ code: "aiLimit", signedIn: true, error: `今日の無料のAI（${FREE_AI_PER_DAY}回）を使い切りました。ポイントで「AIチケット」と交換すると続けて使えます` });
  return false;
}

/** After an AI request that really used the AI: count it (free first, then a ticket). */
export async function recordAiUse(req: Request, feature: AiFeature) {
  if (!isClaudeConfigured()) return;
  if (!req.auth) {
    const key = anonymousKey(req);
    anonymous.set(key, (anonymous.get(key) ?? 0) + 1);
    return;
  }
  const a = await aiAllowance(req.auth.userId);
  await prisma.aiUsage.create({ data: { userId: req.auth.userId, feature, paid: a.freeLeft === 0 } });
}

export function resetAnonymousAiUse() {
  anonymous.clear();
}
