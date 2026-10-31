import fs from "fs";
import path from "path";
import { geocode, isGoogleMapsConfigured } from "./googleMaps";
import { ttlCache } from "../lib/ttlCache";

// 出発地点を探す: where a typed starting point is — any station, city, town,
// ward or address in Japan — without needing a Google Maps key.
//
// Built-in data (backend/data/places.json, made by editing):
//   - stations: 国土数値情報「鉄道データ（N02）」令和6年（国土交通省）, ~9,000
//     stations, via antfu/mlit-json; each with the prefecture of the nearest
//     municipal office
//   - municipalities (incl. wards): code4fukui/localgovjp (CC0), at the
//     city hall / town office
// For an address below the municipality ("大阪市北区梅田1丁目"), the 町・丁目
// is placed with Geolonia 住所データ (CC BY 4.0), fetched per municipality and
// cached. With GOOGLE_MAPS_API_KEY, Google's geocoder is tried first.
//
// The result says what was found (`kind`), so the app can show e.g.
// "松本駅（長野県）" or "松本市（市役所の位置）" instead of pretending to precision.

export type PlaceKind = "google" | "station" | "town" | "municipality" | "prefecture";

export interface FoundPlace {
  lat: number;
  lng: number;
  label: string;
  kind: PlaceKind;
}

type Muni = [pref: string, name: string, kana: string, lat: number, lng: number];
type Station = [name: string, pref: string, lat: number, lng: number, lines: string[]];

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];
// Where a prefecture-only origin is placed: its prefectural capital's office.
const CAPITALS: Record<string, string> = {
  北海道: "札幌市中央区", 青森県: "青森市", 岩手県: "盛岡市", 宮城県: "仙台市青葉区", 秋田県: "秋田市", 山形県: "山形市", 福島県: "福島市",
  茨城県: "水戸市", 栃木県: "宇都宮市", 群馬県: "前橋市", 埼玉県: "さいたま市浦和区", 千葉県: "千葉市中央区", 東京都: "新宿区", 神奈川県: "横浜市中区",
  新潟県: "新潟市中央区", 富山県: "富山市", 石川県: "金沢市", 福井県: "福井市", 山梨県: "甲府市", 長野県: "長野市", 岐阜県: "岐阜市",
  静岡県: "静岡市葵区", 愛知県: "名古屋市中区", 三重県: "津市", 滋賀県: "大津市", 京都府: "京都市上京区", 大阪府: "大阪市中央区", 兵庫県: "神戸市中央区",
  奈良県: "奈良市", 和歌山県: "和歌山市", 鳥取県: "鳥取市", 島根県: "松江市", 岡山県: "岡山市北区", 広島県: "広島市中区", 山口県: "山口市",
  徳島県: "徳島市", 香川県: "高松市", 愛媛県: "松山市", 高知県: "高知市", 福岡県: "福岡市中央区", 佐賀県: "佐賀市", 長崎県: "長崎市",
  熊本県: "熊本市中央区", 大分県: "大分市", 宮崎県: "宮崎市", 鹿児島県: "鹿児島市", 沖縄県: "那覇市",
};

let data: { municipalities: Muni[]; stations: Station[] } | null = null;
function places() {
  data ??= JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/places.json"), "utf8"));
  return data!;
}

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
// "二十三" → "23", so "梅田1丁目" and "梅田一丁目" compare equal.
function kanjiNumbers(s: string) {
  return s.replace(/[〇一二三四五六七八九十]+/g, (k) => {
    if (!/十/.test(k)) return [...k].map((c) => KANJI_DIGIT[c]).join("");
    const [tens, ones] = k.split("十");
    return String((tens ? KANJI_DIGIT[tens] ?? 1 : 1) * 10 + (ones ? KANJI_DIGIT[ones] ?? 0 : 0));
  });
}

export function normalizePlace(input: string) {
  return input
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[ヶケ]/g, "ヶ")
    .replace(/^(日本|〒?\d{3}-?\d{4})/, "")
    .trim();
}

const plain = (s: string) => kanjiNumbers(s.replace(/^(大字|字)/, "").replace(/[ヶケ]/g, "ヶ"));

// ---- Town (町・丁目) refinement via Geolonia 住所データ -----------------------

const TOWN_DATA_URL = process.env.TOWN_DATA_URL || "https://raw.githubusercontent.com/geolonia/japanese-addresses/master/api/ja";
const townCache = ttlCache<{ town: string; koaza: string; lat: number; lng: number }[]>(24 * 60 * 60 * 1000, 300);

async function townsOf(pref: string, city: string) {
  return townCache.get(`${pref}/${city}`, async () => {
    const res = await fetch(`${TOWN_DATA_URL}/${encodeURIComponent(pref)}/${encodeURIComponent(city)}.json`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`town data ${res.status}`);
    return (await res.json()) as { town: string; koaza: string; lat: number; lng: number }[];
  });
}

async function findTown(pref: string, city: string, rest: string) {
  try {
    const towns = await townsOf(pref, city);
    // "道玄坂2-1" means 道玄坂二丁目.
    const want = plain(rest).replace(/^(\D+?)(\d+)(?:[-‐−ー－の]|番地?)/, "$1$2丁目");
    let best: { town: string; lat: number; lng: number } | null = null;
    for (const t of towns) {
      const name = plain(t.town);
      if (name && want.startsWith(name) && (!best || name.length > plain(best.town).length)) best = t;
    }
    return best;
  } catch {
    return null;
  }
}

// ---- Built-in lookup --------------------------------------------------------

function stationMatches(name: string, pref: string | null) {
  const list = places().stations.filter((s) => s[0] === name && (!pref || s[1] === pref));
  // Same name in several places (府中): the one with the most lines first.
  return list.sort((a, b) => b[4].length - a[4].length);
}

export async function lookupBuiltIn(input: string): Promise<FoundPlace | null> {
  let q = normalizePlace(input);
  if (!q) return null;
  const pref = PREFECTURES.find((p) => q.startsWith(p)) ?? null;
  if (pref) q = q.slice(pref.length);
  const munis = places().municipalities.filter((m) => !pref || m[0] === pref);

  // "松本駅", "JR新宿駅", "長野県松本駅"
  const stationName = q.replace(/^(JR|ＪＲ)/, "").replace(/駅$/, "");
  const typedStation = /駅$/.test(q);
  if (typedStation) {
    const [s] = stationMatches(stationName, pref);
    if (s) return { lat: s[2], lng: s[3], label: `${s[0]}駅（${s[1]}）`, kind: "station" };
  }

  // The longest municipality name the input starts with ("大阪市北区梅田…").
  let muni: Muni | null = null;
  for (const m of munis) if (q.startsWith(m[1]) && (!muni || m[1].length > muni[1].length)) muni = m;
  // A bare name without 市/町/村/区 ("松本") when it's the whole input.
  if (!muni) muni = munis.find((m) => m[1].replace(/[市町村区]$/, "") === q || m[2].replace(/(し|まち|ちょう|むら|そん|く)$/, "") === q) ?? null;
  if (muni) {
    const rest = q.startsWith(muni[1]) ? q.slice(muni[1].length) : "";
    if (rest) {
      // A station named in the rest ("松本市松本駅") or a town ("梅田1丁目").
      const restStation = rest.replace(/駅$/, "");
      const near = stationMatches(restStation, muni[0])[0];
      if (near && /駅$/.test(rest)) return { lat: near[2], lng: near[3], label: `${near[0]}駅（${near[1]}）`, kind: "station" };
      const town = await findTown(muni[0], muni[1], rest);
      if (town) return { lat: town.lat, lng: town.lng, label: `${muni[0]}${muni[1]}${town.town}`, kind: "town" };
    }
    return { lat: muni[3], lng: muni[4], label: `${muni[1]}（${muni[0]}）`, kind: "municipality" };
  }

  // A station named without "駅" ("新宿", "軽井沢").
  const [s] = stationMatches(stationName, pref);
  if (s) return { lat: s[2], lng: s[3], label: `${s[0]}駅（${s[1]}）`, kind: "station" };

  if (pref && !q) {
    const capital = places().municipalities.find((m) => m[0] === pref && m[1] === CAPITALS[pref]);
    if (capital) return { lat: capital[3], lng: capital[4], label: pref, kind: "prefecture" };
  }
  return null;
}

const found = ttlCache<FoundPlace | null>(6 * 60 * 60 * 1000, 2000);

// Google first when configured (most precise for full addresses), else / then the built-in data.
export function locatePlace(input: string): Promise<FoundPlace | null> {
  return found.get(normalizePlace(input), async () => {
    if (isGoogleMapsConfigured()) {
      try {
        const g = await geocode(input);
        if (g) return { lat: g.lat, lng: g.lng, label: input.trim(), kind: "google" };
      } catch (err) {
        console.error("[placeLookup] Google geocoding failed, using built-in data:", err);
      }
    }
    return lookupBuiltIn(input);
  });
}
