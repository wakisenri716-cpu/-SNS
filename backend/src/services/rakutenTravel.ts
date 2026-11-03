// 宿の空室・料金: 楽天トラベル 空室検索API. Jaziba only searches and shows; the
// booking itself happens on 楽天トラベル (the link goes there), so Jaziba is
// never a party to the reservation. Needs RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY
// (楽天ウェブサービス). With RAKUTEN_AFFILIATE_ID the links become affiliate
// links (a commission for bookings). Results must carry the
// "Supported by Rakuten Developers" credit (the frontend shows it).
const BASE = () => process.env.RAKUTEN_API_BASE || "https://openapi.rakuten.co.jp/engine/api";
const VERSION = "20170426";

export const isRakutenConfigured = () => !!process.env.RAKUTEN_APP_ID && !!process.env.RAKUTEN_ACCESS_KEY;

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

/** Hotels with rooms free for these dates near the point, cheapest plans first. */
export async function searchVacantHotels(q: StaySearch): Promise<StayHotel[]> {
  const url = new URL(`${BASE()}/Travel/VacantHotelSearch/${VERSION}`);
  const params: Record<string, string> = {
    applicationId: process.env.RAKUTEN_APP_ID ?? "",
    accessKey: process.env.RAKUTEN_ACCESS_KEY ?? "",
    format: "json",
    formatVersion: "2",
    checkinDate: q.checkin,
    checkoutDate: q.checkout,
    adultNum: String(q.adults),
    latitude: String(q.lat),
    longitude: String(q.lng),
    // Degrees in WGS84, like the rest of Jaziba.
    datumType: "1",
    searchRadius: String(Math.min(3, Math.max(0.1, q.radiusKm))),
    hits: "20",
    sort: "standard",
  };
  if (process.env.RAKUTEN_AFFILIATE_ID) params.affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { accessKey: process.env.RAKUTEN_ACCESS_KEY ?? "" }, signal: AbortSignal.timeout(8000) });
  // No rooms free is a 404 "not_found", not a failure.
  if (res.status === 404) return [];
  if (!res.ok) throw new RakutenError(`rakuten travel ${res.status}`, res.status);
  const data = (await res.json()) as { hotels?: unknown[] };
  return (data.hotels ?? []).map(parseHotel).filter((h): h is StayHotel => h != null);
}
