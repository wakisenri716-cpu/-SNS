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

// Arrival/departure minute at each stop, plus when the trip leaves its origin.
export function computeTimeline(
  startTime: string,
  originLegMin: number | null,
  stayMinutes: number[],
  legMinutes: number[]
) {
  const departAt = parseClock(startTime);
  let clock = departAt + (originLegMin ?? 0);
  const times = stayMinutes.map((stay, i) => {
    const arrive = clock;
    const leave = arrive + stay;
    clock = leave + (legMinutes[i] ?? 0);
    return { arrive, leave };
  });
  return { departAt, times };
}

// "HH:MM", or "翌HH:MM" (in the UI language) once the trip runs past midnight.
export function formatClock(totalMin: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  const { day, time } = splitClock(totalMin);
  return day > 0 ? t("itinerary.nextDay", { time }) : time;
}
