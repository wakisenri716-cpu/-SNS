// 移動中モード timing for a booked trip (乗る便): which phase it's in now,
// how long until departure / arrival, how far along it is.

export type TransportPhase = "later" | "soon" | "enroute" | "arrived";

/** Departing within this many minutes counts as "soon" (head to the platform/gate). */
export const SOON_MIN = 60;

export function transportPhase(t: { departAt: string; arriveAt: string }, now = Date.now()) {
  const dep = new Date(t.departAt).getTime();
  const arr = new Date(t.arriveAt).getTime();
  const toDepart = dep - now;
  const toArrive = arr - now;
  const phase: TransportPhase = toArrive <= 0 ? "arrived" : toDepart <= 0 ? "enroute" : toDepart <= SOON_MIN * 60_000 ? "soon" : "later";
  const progress = phase === "enroute" ? Math.min(1, Math.max(0, (now - dep) / Math.max(1, arr - dep))) : phase === "arrived" ? 1 : 0;
  return { phase, toDepartMs: toDepart, toArriveMs: toArrive, progress };
}

// The one to show first: the trip under way, else the next to depart, else the last one.
export function currentTransport<T extends { departAt: string; arriveAt: string }>(list: T[], now = Date.now()): T | null {
  const sorted = [...list].sort((a, b) => new Date(a.departAt).getTime() - new Date(b.departAt).getTime());
  return (
    sorted.find((t) => transportPhase(t, now).phase === "enroute") ??
    sorted.find((t) => transportPhase(t, now).phase !== "arrived") ??
    sorted.at(-1) ??
    null
  );
}

/** {h, m, s} of a positive duration, for countdowns. */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** A datetime-local input value ("2026-11-03T08:00", local time) → ISO, and back. */
export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}
export function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
