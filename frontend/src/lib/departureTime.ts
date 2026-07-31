// Shared by both access planners (municipality profile + per-reel).

// Default value for <input type="datetime-local"> — "now" in the browser's
// own local time, formatted the way that input expects (no timezone).
export function nowAsDatetimeLocalValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A <input type="datetime-local"> value has no timezone of its own — the
// browser just gives back the digits the user picked. Building a Date from it
// here (in the browser, where "local" unambiguously means the user's own
// timezone) and converting to ISO lets the backend parse the intended moment
// correctly no matter what timezone the server itself runs in.
export function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function formatDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
