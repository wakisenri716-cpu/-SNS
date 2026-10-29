// 見頃 (best season): the months a poster says a place is at its best.

// The current month (1–12) in Japan, where every listed place is.
export function monthInJapan(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).getUTCMonth() + 1;
}

export function isInSeason(bestMonths: number[], now = new Date()) {
  return bestMonths.includes(monthInJapan(now));
}

// Consecutive months as [start, end] runs, joining Dec→Jan: [12,1,2] is one
// run (12, 2), [5,6,10] is (5, 6) and (10, 10).
export function monthRuns(months: number[]): [number, number][] {
  const sorted = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (sorted.length === 12) return [[1, 12]];
  const runs: [number, number][] = [];
  for (const m of sorted) {
    const last = runs.at(-1);
    if (last && m === last[1] + 1) last[1] = m;
    else runs.push([m, m]);
  }
  if (runs.length > 1 && runs[0][0] === 1 && runs.at(-1)![1] === 12) {
    const first = runs.shift()!;
    runs.at(-1)![1] = first[1];
  }
  return runs;
}

// "5月–6月・10月" / "May–Jun, Oct", in the UI language.
// `long` spells months out ("April"), e.g. for reading aloud.
export function formatBestMonths(months: number[], lang: string, style: "short" | "long" = "short") {
  const name = (m: number) => new Intl.DateTimeFormat(lang, { month: style, timeZone: "UTC" }).format(Date.UTC(2026, m - 1, 15));
  const sep = lang === "en" ? ", " : "・";
  return monthRuns(months)
    .map(([a, b]) => (a === b ? name(a) : `${name(a)}–${name(b)}`))
    .join(sep);
}
