import { ttlCache } from "../lib/ttlCache";

// 場所を選ぶ: any named place in Japan from OpenStreetMap — the same data as
// the map's tiles (temples, castles, viewpoints, peaks, waterfalls, beaches,
// parks, shops…) — via Nominatim. The public server's rules
// (operations.osmfoundation.org/policies/nominatim): at most one request a
// second, an identifying User-Agent, results cached, no search-as-you-type.
// So searches run only when the poster presses 検索, go out one at a time,
// and are cached for a week. NOMINATIM_URL can point at another
// Nominatim-compatible server. Results need the "© OpenStreetMap
// contributors" credit (the picker shows it).
const BASE = () => (process.env.NOMINATIM_URL?.trim() || "https://nominatim.openstreetmap.org").replace(/\/$/, "");

export interface OsmPlace {
  name: string;
  /** Prefecture + city, for telling same-named places apart. */
  detail: string;
  lat: number;
  lng: number;
  /** OSM's class/type, e.g. "tourism/attraction", "historic/castle". */
  type: string;
}

let siteOrigin = "";
export function setOsmSiteOrigin(origin: string) {
  if (/^https?:\/\/[^/\s]+$/.test(origin)) siteOrigin = origin;
}
const origin = () => (process.env.APP_ORIGIN?.trim() || siteOrigin).replace(/\/$/, "");

export class OsmBusyError extends Error {}

/** Parses one Nominatim (jsonv2) result. Exported for tests. */
export function parseOsmResult(r: any): OsmPlace | null {
  const lat = Number(r?.lat);
  const lng = Number(r?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const display = typeof r?.display_name === "string" ? r.display_name : "";
  const name = (typeof r?.name === "string" && r.name) || r?.namedetails?.["name:ja"] || r?.namedetails?.name || display.split(",")[0]?.trim();
  if (!name) return null;
  const a = r?.address ?? {};
  const pref = a.province || a.state || "";
  const city = a.city || a.town || a.village || a.municipality || a.county || "";
  return {
    name: String(name).slice(0, 200),
    detail: [pref, city].filter((s, i, all) => s && all.indexOf(s) === i).join(""),
    lat,
    lng,
    type: [r?.category ?? r?.class, r?.type].filter(Boolean).join("/"),
  };
}

// One request at a time, a little over a second apart; a short queue, then "busy".
let last = 0;
let chain: Promise<unknown> = Promise.resolve();
let waiting = 0;
const MAX_WAITING = 5;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (waiting >= MAX_WAITING) return Promise.reject(new OsmBusyError("busy"));
  waiting++;
  const run = chain.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      return await fn();
    } finally {
      waiting--;
    }
  });
  chain = run.catch(() => {});
  return run;
}

const cache = ttlCache<OsmPlace[]>(7 * 24 * 60 * 60 * 1000, 3000);

export function searchOsm(q: string, near?: { lat: number; lng: number }): Promise<OsmPlace[]> {
  const text = q.normalize("NFKC").trim().slice(0, 100);
  // Results near the town come first (viewbox is a preference, not a limit).
  const box = near ? [near.lng - 0.4, near.lat + 0.3, near.lng + 0.4, near.lat - 0.3].map((n) => n.toFixed(2)).join(",") : "";
  return cache.get(`${text}|${box}`, () =>
    throttled(async () => {
      const url = new URL(`${BASE()}/search`);
      for (const [k, v] of Object.entries({
        q: text,
        format: "jsonv2",
        countrycodes: "jp",
        "accept-language": "ja",
        addressdetails: "1",
        namedetails: "1",
        limit: "15",
        ...(box ? { viewbox: box } : {}),
      }))
        url.searchParams.set(k, v);
      const res = await fetch(url, {
        headers: { "User-Agent": `Jaziba/1.0 (tourism SNS${origin() ? `; ${origin()}` : ""})`, ...(origin() ? { Referer: `${origin()}/` } : {}) },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`nominatim ${res.status}`);
      const data = (await res.json()) as unknown[];
      const seen = new Set<string>();
      return (Array.isArray(data) ? data : [])
        .map(parseOsmResult)
        .filter((p): p is OsmPlace => {
          if (!p) return false;
          const key = `${p.name}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    })
  );
}
