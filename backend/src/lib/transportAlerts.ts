import { prisma } from "../prisma";
import { sendPush } from "./push";
import { tripParticipants } from "./trips";

// 乗る便のお知らせ: a push to everyone on the trip about 30 minutes before a
// booked flight/train/bus departs and about 5 minutes before it arrives —
// even with the app closed. Times are the ones the travellers entered (no
// live delay data). Each alert goes once (departNotifiedAt / arriveNotifiedAt,
// cleared when the times are edited); a check runs every 30 seconds.

export const DEPART_ALERT_MIN = 30;
export const ARRIVE_ALERT_MIN = 5;
const CHECK_EVERY_MS = 30_000;
// Missed by more than this (server asleep, say): too late to be useful.
const STALE_MS = 2 * 60_000;

// Travellers' times are in Japan.
function hhmm(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(date);
}

const minutesUntil = (date: Date, now: number) => Math.max(1, Math.round((date.getTime() - now) / 60_000));

export async function runTransportAlerts(now = Date.now()) {
  const departing = await prisma.tripTransport.findMany({
    where: { departNotifiedAt: null, departAt: { gt: new Date(now - STALE_MS), lte: new Date(now + DEPART_ALERT_MIN * 60_000) } },
  });
  for (const t of departing) {
    // Claim it first, so two overlapping checks can't both send.
    const { count } = await prisma.tripTransport.updateMany({ where: { id: t.id, departNotifiedAt: null }, data: { departNotifiedAt: new Date(now) } });
    if (count === 0) continue;
    void sendPush(
      await tripParticipants(t.tripId),
      { type: "departSoon", name: t.name, from: t.fromName, platform: t.departPlatform, time: hhmm(t.departAt), minutes: minutesUntil(t.departAt, now), tripId: t.tripId, transportId: t.id },
      { ttlSeconds: DEPART_ALERT_MIN * 60 }
    );
  }

  const arriving = await prisma.tripTransport.findMany({
    where: { arriveNotifiedAt: null, arriveAt: { gt: new Date(now), lte: new Date(now + ARRIVE_ALERT_MIN * 60_000) }, departAt: { lt: new Date(now) } },
  });
  for (const t of arriving) {
    const { count } = await prisma.tripTransport.updateMany({ where: { id: t.id, arriveNotifiedAt: null }, data: { arriveNotifiedAt: new Date(now) } });
    if (count === 0) continue;
    void sendPush(
      await tripParticipants(t.tripId),
      { type: "arriveSoon", name: t.name, to: t.toName, time: hhmm(t.arriveAt), minutes: minutesUntil(t.arriveAt, now), tripId: t.tripId, transportId: t.id },
      { ttlSeconds: ARRIVE_ALERT_MIN * 60 }
    );
  }
  return { departing: departing.length, arriving: arriving.length };
}

export function startTransportAlerts() {
  const tick = () => void runTransportAlerts().catch((err) => console.error("[transportAlerts]", err));
  tick();
  return setInterval(tick, CHECK_EVERY_MS);
}
