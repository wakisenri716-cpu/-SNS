// Best-effort, fully offline IP → country guess (via the geoip-lite bundled
// database — no external API calls, no key, no per-request network cost).
// Used only to pre-fill the nationality field at signup as a *hint*; it never
// overrides an explicit user choice and is always editable afterward from
// Settings. Email addresses carry no reliable age/nationality signal, and a
// domain-based guess (e.g. "@gmail.com") is far too unreliable to use, so IP
// geolocation is the only automatic signal available — and even that is only
// approximate (VPNs, travel, shared corporate ranges all throw it off).
import geoip from "geoip-lite";
import { type Nationality } from "../types";

// Maps ISO 3166-1 alpha-2 country codes (as returned by geoip-lite) to this
// app's Nationality options. Countries without a dedicated option are left
// unmapped on purpose — guessing "other" for everything unmapped would imply
// more confidence than the data actually supports.
const COUNTRY_CODE_TO_NATIONALITY: Partial<Record<string, Nationality>> = {
  JP: "japan",
  CN: "china",
  TW: "taiwan",
  HK: "hong_kong",
  KR: "south_korea",
  TH: "thailand",
  SG: "singapore",
  VN: "vietnam",
  PH: "philippines",
  ID: "indonesia",
  US: "usa",
  CA: "canada",
  GB: "uk",
  FR: "france",
  DE: "germany",
  AU: "australia",
};

export function guessNationalityFromIp(ip: string | undefined | null): Nationality | null {
  if (!ip) return null;
  const normalized = ip.replace(/^::ffff:/, ""); // IPv4-mapped IPv6, seen behind some proxies
  if (normalized === "127.0.0.1" || normalized === "::1") return null;

  const lookup = geoip.lookup(normalized);
  if (!lookup) return null;
  return COUNTRY_CODE_TO_NATIONALITY[lookup.country] ?? null;
}
