// 宿の空室・料金: 楽天トラベル 空室検索API. Jaziba only searches and shows; the
// booking itself happens on 楽天トラベル (the link goes there), so Jaziba is
// never a party to the reservation. Needs RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY
// (楽天ウェブサービス). With RAKUTEN_AFFILIATE_ID the links become affiliate
// links (a commission for bookings). Results must carry the
// "Supported by Rakuten Developers" credit (the frontend shows it).
const BASE = () => process.env.RAKUTEN_API_BASE || "https://openapi.rakuten.co.jp/engine/api";
const VERSION = "20170426";

// The settings, forgiving of the usual slips in the Render box (spaces, a
// line break, RAKUTEN_APPLICATION_ID for RAKUTEN_APP_ID).
const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find((v) => !!v) ?? "";
export const rakutenAppId = () => env("RAKUTEN_APP_ID", "RAKUTEN_APPLICATION_ID", "RAKUTEN_APPID");
export const rakutenAccessKey = () => env("RAKUTEN_ACCESS_KEY", "RAKUTEN_ACCESSKEY", "RAKUTEN_KEY");
export const rakutenAffiliateId = () => env("RAKUTEN_AFFILIATE_ID", "RAKUTEN_AFFILIATEID");

export const isRakutenConfigured = () => !!rakutenAppId() && !!rakutenAccessKey();

// 楽天 only accepts requests from the websites registered for the app
// (「許可されているウェブサイト」), judged by the Referer / Origin a browser
// would send. These calls come from the server, so they say the site's
// address themselves: APP_ORIGIN if set, else the address the app was
// reached at (routes/stays.ts passes it on).
let siteOrigin = "";
export function setRakutenSiteOrigin(origin: string) {
  if (/^https?:\/\/[^/\s]+$/.test(origin)) siteOrigin = origin;
}
const origin = () => (process.env.APP_ORIGIN?.trim() || siteOrigin).replace(/\/$/, "");

export interface StayPlan {
  name: string;
  roomName: string;
  /** Total for the stay, all guests (yen, tax incl., as 楽天トラベル shows). */
  totalYen: number | null;
  breakfast: boolean;
  dinner: boolean;
  reserveUrl: string;
}

export interface StayHotel {
  id: number;
  name: string;
  imageUrl: string | null;
  /** The lowest price 楽天トラベル lists per person per night (yen). */
  minChargeYen: number | null;
  reviewAverage: number | null;
  reviewCount: number;
  access: string;
  nearestStation: string;
  address: string;
  lat: number | null;
  lng: number | null;
  infoUrl: string;
  planListUrl: string;
  plans: StayPlan[];
}

export interface StaySearch {
  lat: number;
  lng: number;
  /** km, 0.1–3 (the API's limit). */
  radiusKm: number;
  checkin: string;
  checkout: string;
  adults: number;
}

export class RakutenError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : "");

/** One hotel from the API's (formatVersion 2) answer. Exported for tests. */
export function parseHotel(entry: unknown): StayHotel | null {
  // formatVersion 2: each hotel is an array of parts ({hotelBasicInfo}, {roomInfo: [...]}, ...).
  const parts = Array.isArray(entry) ? entry : Array.isArray((entry as { hotel?: unknown })?.hotel) ? (entry as { hotel: unknown[] }).hotel : [];
  const basic = parts.find((p) => p && typeof p === "object" && "hotelBasicInfo" in p)?.hotelBasicInfo as Record<string, unknown> | undefined;
  if (!basic || num(basic.hotelNo) == null || !str(basic.hotelName)) return null;
  // Each {roomInfo: [{roomBasicInfo}, {dailyCharge}]} is one plan.
  const rooms = parts.filter((p) => p && typeof p === "object" && "roomInfo" in p).map((p) => (Array.isArray(p.roomInfo) ? p.roomInfo : [p.roomInfo]));
  const plans: StayPlan[] = [];
  for (const parts2 of rooms) {
    const info = parts2.find((p: any) => p?.roomBasicInfo)?.roomBasicInfo as Record<string, unknown> | undefined;
    const charge = parts2.find((p: any) => p?.dailyCharge)?.dailyCharge as Record<string, unknown> | undefined;
    if (!info || !https(info.reserveUrl)) continue;
    plans.push({
      name: str(info.planName),
      roomName: str(info.roomName),
      totalYen: num(charge?.total),
      breakfast: num(info.withBreakfastFlag) === 1,
      dinner: num(info.withDinnerFlag) === 1,
      reserveUrl: https(info.reserveUrl),
    });
  }
  plans.sort((a, b) => (a.totalYen ?? Infinity) - (b.totalYen ?? Infinity));
  return {
    id: num(basic.hotelNo)!,
    name: str(basic.hotelName),
    imageUrl: https(basic.hotelImageUrl) || https(basic.hotelThumbnailUrl) || null,
    minChargeYen: num(basic.hotelMinCharge),
    reviewAverage: num(basic.reviewAverage) || null,
    reviewCount: num(basic.reviewCount) ?? 0,
    access: str(basic.access),
    nearestStation: str(basic.nearestStation),
    address: `${str(basic.address1)}${str(basic.address2)}`,
    lat: num(basic.latitude),
    lng: num(basic.longitude),
    infoUrl: https(basic.hotelInformationUrl),
    planListUrl: https(basic.planListUrl) || https(basic.hotelInformationUrl),
    plans: plans.slice(0, 3),
  };
}

async function rakutenGet(api: string, params: Record<string, string>): Promise<{ hotels?: unknown[] } | null> {
  const url = new URL(`${BASE()}/Travel/${api}/${VERSION}`);
  const all: Record<string, string> = {
    applicationId: rakutenAppId(),
    accessKey: rakutenAccessKey(),
    format: "json",
    formatVersion: "2",
    // Degrees in WGS84, like the rest of Jaziba.
    datumType: "1",
    ...params,
  };
  if (rakutenAffiliateId()) all.affiliateId = rakutenAffiliateId();
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { accessKey: rakutenAccessKey(), ...(origin() ? { Referer: `${origin()}/`, Origin: origin() } : {}) }, signal: AbortSignal.timeout(8000) });
  // Nothing found (or no rooms free) is a 404 "not_found", not a failure.
  if (res.status === 404) return null;
  if (!res.ok) throw new RakutenError(`rakuten travel ${api} ${res.status}`, res.status);
  return (await res.json()) as { hotels?: unknown[] };
}

const hotelsOf = (data: { hotels?: unknown[] } | null) => (data?.hotels ?? []).map(parseHotel).filter((h): h is StayHotel => h != null);

/**
 * Hotels with rooms free for these dates — near the point, or just these
 * hotels (hotelNos, up to 15) — cheapest plans first.
 */
export async function searchVacantHotels(q: StaySearch & { hotelNos?: number[] }): Promise<StayHotel[]> {
  const where: Record<string, string> = q.hotelNos?.length
    ? { hotelNo: q.hotelNos.slice(0, 15).join(",") }
    : { latitude: String(q.lat), longitude: String(q.lng), searchRadius: String(Math.min(3, Math.max(0.1, q.radiusKm))) };
  return hotelsOf(
    await rakutenGet("VacantHotelSearch", {
      ...where,
      checkinDate: q.checkin,
      checkoutDate: q.checkout,
      adultNum: String(q.adults),
      hits: "20",
      sort: "standard",
    })
  );
}

/** The hotels near a point (no dates: who they are and from what price). */
export async function hotelsNear(lat: number, lng: number, radiusKm: number, hits = 10): Promise<StayHotel[]> {
  return hotelsOf(
    await rakutenGet("SimpleHotelSearch", {
      latitude: String(lat),
      longitude: String(lng),
      searchRadius: String(Math.min(3, Math.max(0.1, radiusKm))),
      hits: String(Math.min(30, hits)),
    })
  );
}
