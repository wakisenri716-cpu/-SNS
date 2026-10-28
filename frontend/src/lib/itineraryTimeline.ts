// Clock-time math for a しおり: the start time, then travel + stay at each
// stop in turn. Shared by the editable panel and the shared read-only page.

// "HH:MM" -> minutes since midnight (09:00 if malformed).
export function parseClock(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
}

// Minutes since the trip day's midnight -> "HH:MM", plus how many days later.
export function splitClock(totalMin: number) {
  const day = Math.floor(totalMin / (24 * 60));
  const min = totalMin % (24 * 60);
  return { day, time: `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}` };
}

// Stay overnight at a place to stay that isn't the last stop: leave the next
// morning at the trip's start time, after at least this much rest.
const MIN_REST_MIN = 6 * 60;

// Arrival/departure minute at each stop (counted from the first day's
// midnight), plus when the trip leaves its origin. `overnight[i]` marks a
// stop where the traveler sleeps; its stay length is ignored.
export function computeTimeline(
  startTime: string,
  originLegMin: number | null,
  stayMinutes: number[],
  legMinutes: number[],
  overnight: boolean[] = []
) {
  const departAt = parseClock(startTime);
  let clock = departAt + (originLegMin ?? 0);
  const times = stayMinutes.map((stay, i) => {
    const arrive = clock;
    const leave = overnight[i]
      ? Math.ceil((arrive + MIN_REST_MIN - departAt) / (24 * 60)) * 24 * 60 + departAt
      : arrive + stay;
    clock = leave + (legMinutes[i] ?? 0);
    return { arrive, leave, day: Math.floor(arrive / (24 * 60)) };
  });
  return { departAt, times };
}

// Which stops are overnight stays: places to stay before the last stop.
export function overnightStops(stops: { category: string }[]) {
  return stops.map((s, i) => s.category === "lodging" && i < stops.length - 1);
}

// "HH:MM" on `onDay` (0 = the first day), "翌HH:MM" the day after, and
// "3日目 HH:MM" further on — in the UI language.
export function formatClock(
  totalMin: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
  onDay = 0
) {
  const { day, time } = splitClock(totalMin);
  if (day === onDay) return time;
  if (day === onDay + 1) return t("itinerary.nextDay", { time });
  return t("itinerary.dayTime", { day: day + 1, time });
}
