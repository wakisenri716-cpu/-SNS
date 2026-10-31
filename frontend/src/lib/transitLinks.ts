// Links to the services that do have Japan's timetables and live status.
// Jaziba can't fetch routes, timetables or flight status itself (Google's
// API returns no transit data for Japan, and the timetable / flight APIs are
// paid), so legs and booked trips link out with the places filled in.

type Place = { name: string; lat?: number | null; lng?: number | null };

const at = (p: Place) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.name);

/** Google Maps directions by public transport (opens the app on phones). */
export function googleTransitUrl(from: Place, to: Place) {
  const q = new URLSearchParams({ api: "1", origin: at(from), destination: at(to), travelmode: "transit" });
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Yahoo!乗換案内 search between two place names. */
export function yahooTransitUrl(fromName: string, toName: string) {
  return `https://transit.yahoo.co.jp/search/result?${new URLSearchParams({ from: fromName, to: toName })}`;
}

export type TransportKind = "plane" | "train" | "bus" | "ferry" | "other";

/** Where to check delays and cancellations for a booked trip. */
export function statusUrl(kind: TransportKind, name: string, operator: string) {
  if (kind === "train") return "https://transit.yahoo.co.jp/diainfo";
  const words = kind === "plane" ? `${name} 運航状況` : `${operator} ${name} 運行情報`.trim();
  return `https://www.google.com/search?${new URLSearchParams({ q: words })}`;
}
