// 区間の行き方: the ways written down for each しおり leg, and what the
// chosen one means for the timeline. Pure helpers (tested in tests/).

export const LEG_MODES = ["train", "bus", "car", "taxi", "walk", "bike", "plane", "ferry", "other"] as const;
export type LegModeName = (typeof LEG_MODES)[number];

/** Modes that have rides (乗る便) with times and platforms. */
export const RIDE_MODES: readonly string[] = ["train", "bus", "plane", "ferry"];

type Ride = { departAt: string; arriveAt: string };
type Option = { fromId: string; toId: string; chosen: boolean; durationMin: number | null; rides: Ride[] };

/** Door-to-door minutes: as written, else from the first ride's departure to the last one's arrival. */
export function optionMinutes(o: { durationMin: number | null; rides: Ride[] }): number | null {
  if (o.durationMin != null) return o.durationMin;
  if (o.rides.length === 0) return null;
  const start = Math.min(...o.rides.map((r) => new Date(r.departAt).getTime()));
  const end = Math.max(...o.rides.map((r) => new Date(r.arriveAt).getTime()));
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function optionsFor<T extends Option>(options: T[] | undefined, fromId: string, toId: string) {
  return (options ?? []).filter((o) => o.fromId === fromId && o.toId === toId);
}

export function chosenFor<T extends Option>(options: T[] | undefined, fromId: string, toId: string): T | null {
  return optionsFor(options, fromId, toId).find((o) => o.chosen) ?? null;
}

/**
 * Minutes for each leg of the timeline: the chosen way's time when it has
 * one, else the estimate. `stopIds` in order; `originMin` is the estimate
 * from the 出発地点 (null without one).
 */
export function legMinutesWithChoices(
  stopIds: string[],
  estimates: number[],
  originMin: number | null,
  options: Option[] | undefined
) {
  const pick = (fromId: string, toId: string, fallback: number) => {
    const chosen = chosenFor(options, fromId, toId);
    return (chosen && optionMinutes(chosen)) ?? fallback;
  };
  return {
    originMin: originMin == null || stopIds.length === 0 ? originMin : pick("origin", stopIds[0], originMin),
    legMinutes: estimates.map((m, i) => (stopIds[i + 1] ? pick(stopIds[i], stopIds[i + 1], m) : m)),
  };
}

/** Total fare of the chosen ways on the legs that are in the しおり now. */
export function chosenFareTotal(legs: { fromId: string; toId: string }[], options: (Option & { fareYen: number | null })[] | undefined) {
  let total = 0;
  let count = 0;
  for (const leg of legs) {
    const c = chosenFor(options, leg.fromId, leg.toId);
    if (c?.fareYen != null) {
      total += c.fareYen;
      count++;
    }
  }
  return { total, count };
}
