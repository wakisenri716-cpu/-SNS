import { prisma } from "../prisma";

// Points are derived from what the user has contributed rather than stored as
// a running balance, so they can't drift out of sync with the underlying rows.
// There is no way to spend them yet — the pitch deck's coupon/reward side
// doesn't exist, so the UI labels them as a prototype.
export const POINTS_PER_TRAVEL_REPORT = 10;
export const POINTS_PER_VISIT = 20;

export async function getUserPoints(userId: string) {
  const [reportCount, visitCount] = await Promise.all([
    prisma.travelTimeReport.count({ where: { userId } }),
    prisma.visit.count({ where: { userId } }),
  ]);
  return {
    points: reportCount * POINTS_PER_TRAVEL_REPORT + visitCount * POINTS_PER_VISIT,
    reportCount,
    visitCount,
  };
}
