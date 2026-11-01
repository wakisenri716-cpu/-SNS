import { prisma } from "../prisma";

// Points are derived from what the user has contributed rather than stored as
// a running balance, so they can't drift out of sync with the underlying rows.
// There is no way to spend them yet — the pitch deck's coupon/reward side
// doesn't exist, so the UI labels them as a prototype.
export const POINTS_PER_TRAVEL_REPORT = 10;
export const POINTS_PER_VISIT = 20;
// A photo or video a municipality approved (素材の提供, see the Submission model).
export const POINTS_PER_SUBMISSION = 100;

export async function getUserPoints(userId: string) {
  const [reportCount, visitCount, submissionCount] = await Promise.all([
    prisma.travelTimeReport.count({ where: { userId } }),
    prisma.visit.count({ where: { userId } }),
    prisma.submission.count({ where: { userId, status: "approved" } }),
  ]);
  return {
    points: reportCount * POINTS_PER_TRAVEL_REPORT + visitCount * POINTS_PER_VISIT + submissionCount * POINTS_PER_SUBMISSION,
    reportCount,
    visitCount,
    submissionCount,
  };
}
