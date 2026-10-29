// 旅行中モード: where the traveler should be in their しおり right now, from
// the timeline (minutes from the trip's first midnight) and the clock.

export type LiveStatus =
  | { kind: "before"; minutes: number }
  | { kind: "at"; index: number; minutes: number }
  | { kind: "moving"; index: number; minutes: number }
  | { kind: "done" };

// `now` is minutes since the first day's midnight; `index` is the stop being
// visited, or for "moving" the stop being headed to; `minutes` is until
// leaving (at), arriving (moving) or setting off (before).
export function liveStatus(times: { arrive: number; leave: number }[], departAt: number, now: number): LiveStatus {
  if (times.length === 0) return { kind: "done" };
  if (now < departAt) return { kind: "before", minutes: departAt - now };
  for (let i = 0; i < times.length; i++) {
    if (now < times[i].arrive) return { kind: "moving", index: i, minutes: times[i].arrive - now };
    if (now < times[i].leave) return { kind: "at", index: i, minutes: times[i].leave - now };
  }
  return { kind: "done" };
}

const KEY = "jaziba-live-trip";

export interface LiveTripState {
  // The trip's first day, "YYYY-MM-DD" (device local time).
  date: string;
  // Running late: every time after now shifts by this many minutes.
  delay: number;
  // Which trip (旅) is under way.
  tripId?: string;
}

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Minutes since midnight of `date` (can exceed a day on a multi-day trip).
export function minutesSince(date: string, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor((now.getTime() - new Date(y, m - 1, d).getTime()) / 60_000);
}

export function loadLiveTrip(): LiveTripState | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.date === "string" && typeof v.delay === "number" ? v : null;
  } catch {
    return null;
  }
}

export function saveLiveTrip(state: LiveTripState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered; the mode still works for this visit.
  }
}
