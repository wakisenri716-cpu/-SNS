// 予約明細を貼り付け: reads the usual fields from a booking confirmation email
// on the device (楽天トラベル, じゃらん, 一休, a hotel's own mail, and the
// English ones from Booking.com and the like) — no AI, nothing sent. What it
// can't find stays empty for the traveller (or the AI) to fill.
export interface ReservationGuess {
  kind?: "lodging" | "restaurant" | "activity" | "other";
  name?: string;
  /** Local "YYYY-MM-DDTHH:MM". */
  start?: string;
  end?: string;
  address?: string;
  phone?: string;
  confirmation?: string;
  guests?: number;
  planName?: string;
  priceYen?: number;
  payment?: "paid" | "onsite";
  bookedVia?: string;
  url?: string;
}

const SITES: [RegExp, string][] = [
  [/楽天トラベル|travel\.rakuten/i, "楽天トラベル"],
  [/じゃらん|jalan\.net/i, "じゃらん"],
  [/一休|ikyu\.com/i, "一休.com"],
  [/booking\.com/i, "Booking.com"],
  [/expedia/i, "Expedia"],
  [/agoda/i, "Agoda"],
  [/yahoo!?\s*トラベル|travel\.yahoo/i, "Yahoo!トラベル"],
  [/食べログ|tabelog/i, "食べログ"],
  [/ホットペッパー|hotpepper/i, "ホットペッパー"],
];

/** The value after a label like 「予約番号：」 on the same line. */
function field(text: string, labels: string[]): string {
  for (const label of labels) {
    const m = text.match(new RegExp(`(?:^|\\n)[\\s■□●・【\\[]*(?:ご|お)?${label}[\\s】\\]]*[:：]?[\\s]*([^\\n]+)`, "i"));
    const v = m?.[1]?.trim().replace(/^[:：]\s*/, "");
    if (v) return v;
  }
  return "";
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 2027年5月20日 / 2027/5/20 / 2027-05-20 / May 20, 2027 → "2027-05-20". */
export function readDate(s: string): string {
  const ja = s.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (ja) return `${ja[1]}-${pad(+ja[2])}-${pad(+ja[3])}`;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const en = s.toLowerCase().match(/(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})/);
  if (en) {
    const day = Number(en[1] ?? en[3]);
    if (day) return `${en[4]}-${pad(months.indexOf(en[2]) + 1)}-${pad(day)}`;
  }
  return "";
}
const readTime = (s: string) => {
  const m = s.match(/(\d{1,2})\s*[:：時]\s*(\d{2})?/);
  return m && +m[1] < 24 ? `${pad(+m[1])}:${m[2] ?? "00"}` : "";
};
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d + n));
  return `${out.getUTCFullYear()}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
};

export function guessReservation(raw: string): ReservationGuess {
  const text = raw.normalize("NFKC").replace(/\r\n?/g, "\n");
  const g: ReservationGuess = {};

  g.bookedVia = SITES.find(([re]) => re.test(text))?.[1];
  const lodging = /宿泊|チェックイン|check-?in|泊/i.test(text);
  const restaurant = /来店|ご来店|席|コース|食べログ|ホットペッパー|restaurant|table for/i.test(text);
  g.kind = lodging ? "lodging" : restaurant ? "restaurant" : undefined;

  g.confirmation = field(text, ["予約番号", "予約No\\.?", "予約受付番号", "ご予約番号", "確認番号", "booking (?:number|id|reference)", "confirmation (?:number|code)", "reservation (?:number|id)"]).split(/\s/)[0] || undefined;
  g.name =
    field(text, ["宿泊施設名", "宿泊施設", "施設名", "ホテル名", "宿名", "店舗名", "店名", "お店", "property", "hotel name", "hotel", "restaurant"]).replace(/\s*[(（].*$/, "") || undefined;
  g.address = field(text, ["住所", "所在地", "address"]) || undefined;
  const phone = field(text, ["電話番号", "TEL", "電話", "phone"]).match(/\+?[\d-()（）\s]{9,}/)?.[0]?.trim();
  g.phone = phone || undefined;
  g.planName = field(text, ["プラン名", "宿泊プラン", "プラン", "コース名", "コース", "room type", "room"]) || undefined;

  // When: check-in / check-out (lodging), or the reserved date and time.
  const inLine = field(text, ["チェックイン日", "チェックイン", "宿泊日", "到着日", "check-?in date", "check-?in", "arrival"]);
  const outLine = field(text, ["チェックアウト日", "チェックアウト", "出発日", "check-?out date", "check-?out", "departure"]);
  const atLine = field(text, ["予約日時", "来店日時", "ご予約日時", "日時", "利用日", "date"]);
  const inDay = readDate(inLine) || readDate(atLine);
  if (inDay) {
    const inTime = readTime(field(text, ["チェックイン時間", "チェックイン予定時刻", "到着時刻", "check-?in time"]) || inLine.replace(/^[^\d]*\d{4}\D+\d{1,2}\D+\d{1,2}\D*/, "")) || (g.kind === "lodging" ? "15:00" : readTime(atLine.replace(/^[^\d]*\d{4}\D+\d{1,2}\D+\d{1,2}\D*/, "")));
    if (inTime) g.start = `${inDay}T${inTime}`;
    if (g.kind === "lodging") {
      const nights = Number(field(text, ["宿泊日数", "泊数", "nights?"]).match(/\d+/)?.[0] ?? text.match(/(\d+)\s*泊/)?.[1] ?? 0);
      const outDay = readDate(outLine) || (nights > 0 ? addDays(inDay, nights) : "");
      const outTime = readTime(field(text, ["チェックアウト時間", "check-?out time"]) || outLine.replace(/^[^\d]*\d{4}\D+\d{1,2}\D+\d{1,2}\D*/, "")) || "10:00";
      if (outDay) g.end = `${outDay}T${outTime}`;
    }
  }

  const people = field(text, ["人数", "宿泊人数", "ご利用人数", "guests?", "adults?"]);
  const total = (people.match(/(\d+)\s*(?:名|人|people|guests?|adults?)/gi) ?? []).reduce((sum, p) => sum + Number(p.match(/\d+/)![0]), 0);
  if (total > 0 && total < 100) g.guests = total;
  else if (/^\d{1,2}$/.test(people)) g.guests = Number(people);

  const price = field(text, ["合計金額", "お支払い金額", "お支払金額", "支払金額", "合計", "料金合計", "宿泊料金", "料金", "total (?:price|amount)", "total"]);
  const yen = price.match(/(?:¥|￥|JPY)?\s*([\d,]{3,})\s*(?:円|JPY)?/);
  if (yen && (/円|¥|￥|JPY/.test(price) || !/[$€£]/.test(price))) g.priceYen = Number(yen[1].replace(/,/g, ""));
  if (/(事前|オンライン|カード)(決済|払い)済|支払済|paid online|already paid|prepaid/i.test(text)) g.payment = "paid";
  else if (/現地(決済|払い|でお支払い)|pay at the property|pay at hotel/i.test(text)) g.payment = "onsite";

  g.url = text.match(/https:\/\/[^\s<>"'）)]+/)?.[0];
  for (const k of Object.keys(g) as (keyof ReservationGuess)[]) if (g[k] === undefined || g[k] === "") delete g[k];
  return g;
}
