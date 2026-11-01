import { prisma } from "../prisma";
import { sendPush } from "./push";
import { todayInJapan } from "../routes/events";

// クーポンの期限のお知らせ: a coupon you exchanged points for and haven't
// used, ending within REMIND_DAYS — one push, sent in the daytime (Japan
// time) so it doesn't wake anyone.
export const REMIND_DAYS = 3;
const CHECK_EVERY_MS = 10 * 60_000;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const japanHour = (now: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(now));

export async function runCouponReminders(now = new Date()) {
  const hour = japanHour(now);
  if (hour < DAY_START_HOUR || hour >= DAY_END_HOUR) return { sent: 0 };
  const today = todayInJapan(now);
  const due = await prisma.couponRedemption.findMany({
    where: { usedAt: null, remindedAt: null, coupon: { validUntil: { gte: today, lte: addDays(today, REMIND_DAYS - 1) } } },
    include: { coupon: { select: { title: true, validUntil: true, municipality: { select: { name: true } }, company: { select: { name: true } } } } },
    take: 500,
  });
  let sent = 0;
  for (const r of due) {
    // Claim it first, so two overlapping checks can't both send.
    const { count } = await prisma.couponRedemption.updateMany({ where: { id: r.id, remindedAt: null }, data: { remindedAt: now } });
    if (count === 0) continue;
    sent++;
    void sendPush([r.userId], {
      type: "couponExpiring",
      title: r.coupon.title,
      issuer: r.coupon.company?.name ?? r.coupon.municipality.name,
      until: r.coupon.validUntil!,
      redemptionId: r.id,
    });
  }
  return { sent };
}

export function startCouponReminders() {
  const tick = () => void runCouponReminders().catch((err) => console.error("[couponReminders]", err));
  tick();
  return setInterval(tick, CHECK_EVERY_MS);
}
