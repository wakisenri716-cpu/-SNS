// Aggregation for 「みんなの実測」 (TravelTimeReport). The starting point is
// free text a traveler typed — it could be a home address — so an origin is
// only ever shown once at least MIN_REPORTERS_PER_ORIGIN different users have
// reported from it. Reports from rarer origins are only counted, never
// labeled. Used for both the public access page and municipality insights.
export const MIN_REPORTERS_PER_ORIGIN = 2;

interface ReportRow {
  userId: string;
  mode: string;
  durationMin: number;
  originLabel: string;
}

function visibleOrigins(reports: ReportRow[]) {
  const usersByOrigin = new Map<string, Set<string>>();
  for (const r of reports) {
    usersByOrigin.set(r.originLabel, (usersByOrigin.get(r.originLabel) ?? new Set()).add(r.userId));
  }
  return new Set([...usersByOrigin].filter(([, users]) => users.size >= MIN_REPORTERS_PER_ORIGIN).map(([o]) => o));
}

// Per origin + mode averages (only shown origins), plus how many reports were
// left out because their origin is too rare to show.
export function summarizeByOriginAndMode(reports: ReportRow[]) {
  const shown = visibleOrigins(reports);
  const groups = new Map<string, { originLabel: string; mode: string; durations: number[] }>();
  let hiddenCount = 0;
  for (const r of reports) {
    if (!shown.has(r.originLabel)) {
      hiddenCount++;
      continue;
    }
    const key = `${r.originLabel}\u0000${r.mode}`;
    const group = groups.get(key) ?? { originLabel: r.originLabel, mode: r.mode, durations: [] };
    group.durations.push(r.durationMin);
    groups.set(key, group);
  }
  const summary = [...groups.values()]
    .map((g) => ({
      originLabel: g.originLabel,
      mode: g.mode,
      count: g.durations.length,
      averageMin: Math.round(g.durations.reduce((a, b) => a + b, 0) / g.durations.length),
    }))
    .sort((a, b) => b.count - a.count);
  return { summary, hiddenCount };
}

// Where travelers come from, per shown origin: report count and modes used.
export function summarizeOrigins(reports: ReportRow[]) {
  const shown = visibleOrigins(reports);
  const byOrigin = new Map<string, Record<string, number>>();
  let hiddenCount = 0;
  for (const r of reports) {
    if (!shown.has(r.originLabel)) {
      hiddenCount++;
      continue;
    }
    const modes = byOrigin.get(r.originLabel) ?? {};
    modes[r.mode] = (modes[r.mode] ?? 0) + 1;
    byOrigin.set(r.originLabel, modes);
  }
  const origins = [...byOrigin]
    .map(([originLabel, modeCounts]) => ({
      originLabel,
      reportCount: Object.values(modeCounts).reduce((a, b) => a + b, 0),
      modeCounts,
    }))
    .sort((a, b) => b.reportCount - a.reportCount);
  return { origins, hiddenCount };
}
