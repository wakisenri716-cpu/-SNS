// "3日前" / "3 days ago" style dates, falling back to the full date after a month.
export function relativeTime(iso: string, lang: string) {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
  ];
  let value = diffSec;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return new Date(iso).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
}
