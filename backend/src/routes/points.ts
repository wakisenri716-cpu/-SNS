import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { NotEnoughPoints, getUserPoints } from "../lib/points";
import { AI_TICKET_PACKS, aiAllowance } from "../lib/aiQuota";

// ポイント: the balance (earned − spent), today's AI allowance, and AIチケット
// for points. Coupons are in routes/coupons.ts.
const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const [points, ai] = await Promise.all([getUserPoints(req.auth!.userId), aiAllowance(req.auth!.userId)]);
  res.json({ ...points, ai: { ...ai, packs: AI_TICKET_PACKS } });
});

const packSchema = z.object({ pack: z.enum(AI_TICKET_PACKS.map((p) => p.id) as [string, ...string[]]) });

router.post("/ai-tickets", requireAuth, writeLimiter, async (req, res) => {
  const parsed = packSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "チケットの種類が正しくありません" });
  const pack = AI_TICKET_PACKS.find((p) => p.id === parsed.data.pack)!;
  const userId = req.auth!.userId;
  try {
    // Write first, then check the balance in the same transaction (the write
    // locks the database, so two exchanges at once can't both pass).
    await prisma.$transaction(async (tx) => {
      await tx.aiCreditPurchase.create({ data: { userId, credits: pack.credits, pointsSpent: pack.points } });
      if ((await getUserPoints(userId, tx)).points < 0) throw new NotEnoughPoints();
    });
  } catch (err) {
    if (err instanceof NotEnoughPoints) return res.status(400).json({ code: "notEnoughPoints", error: "ポイントが足りません" });
    throw err;
  }
  const [points, ai] = await Promise.all([getUserPoints(userId), aiAllowance(userId)]);
  res.status(201).json({ ...points, ai: { ...ai, packs: AI_TICKET_PACKS } });
});

export default router;
