import { prisma } from "../prisma";

// Points are derived from what the user has contributed and what they spent
// (coupons, AIチケット) rather than stored as a running balance, so they can't
// drift out of sync with the underlying rows. `points` is the balance.
export const POINTS_PER_TRAVEL_REPORT = 10;
export const POINTS_PER_VISIT = 20;
// A photo or video a municipality approved (素材の提供, see the Submission model).
export const POINTS_PER_SUBMISSION = 100;

type Db = Pick<typeof prisma, "travelTimeReport" | "visit" | "submission" | "couponRedemption" | "aiCreditPurchase">;

export async function getUserPoints(userId: string, db: Db = prisma) {
  const [reportCount, visitCount, submissionCount, coupons, tickets] = await Promise.all([
    db.travelTimeReport.count({ where: { userId } }),
    db.visit.count({ where: { userId } }),
    db.submission.count({ where: { userId, status: "approved" } }),
    db.couponRedemption.aggregate({ where: { userId }, _sum: { pointsSpent: true } }),
    db.aiCreditPurchase.aggregate({ where: { userId }, _sum: { pointsSpent: true } }),
  ]);
  const earned = reportCount * POINTS_PER_TRAVEL_REPORT + visitCount * POINTS_PER_VISIT + submissionCount * POINTS_PER_SUBMISSION;
  const spent = (coupons._sum.pointsSpent ?? 0) + (tickets._sum.pointsSpent ?? 0);
  return { points: earned - spent, earned, spent, reportCount, visitCount, submissionCount };
}

/** Thrown inside a spending transaction when the balance would go below zero. */
export class NotEnoughPoints extends Error {}
