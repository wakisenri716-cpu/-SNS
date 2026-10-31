// 乗換案内の結果を読み取る: the route a traveller chose in a transit app
// (Yahoo!乗換案内, ジョルダン, NAVITIME, …), copied or shared as text, turned
// into rides to save as 乗る便. Apps word their text differently, so this
// reads what it can — stations, times, line name, platforms — and the
// traveller checks it in the form before saving. Nothing is guessed: a field
// not in the text stays empty.

export type RideKind = "plane" | "train" | "bus" | "ferry" | "other";

export interface ParsedRide {
  kind: RideKind;
  name: string;
  fromName: string;
  toName: string;
  /** "HH:MM" */
  depart: string;
  /** "HH:MM", or "" when the text doesn't say */
  arrive: string;
  departPlatform: string;
  arrivePlatform: string;
}

export interface ParsedRoute {
  /** "YYYY-MM-DD" when the text has a date */
  date: string | null;
  rides: ParsedRide[];
}

const TIME = /(\d{1,2}):(\d{2})/;
const TIME_G = /(\d{1,2}):(\d{2})/g;
const STATION_MARK = /^(?:[■◆◇●○◎▼▽□◼▪]|\[[^\]]{1,8}\]|【(?:発|着|乗換)】)\s*/;
const RIDE_MARK = /^[｜|│┃↓⬇︙:]+\s*/;
const ARROW = /\s*(?:→|⇒|->|➡|〜|~)\s*/;
// Lines about the whole route, not a ride.
const NOISE = /(乗換案内|ジョルダン|NAVITIME|ナビタイム|乗車時間|所要時間|乗換\s*\d+\s*回|乗り換え\s*\d+\s*回|運賃|料金|円|IC優先|きっぷ|距離|km|ルート\d|^https?:)/i;
const WALK = /徒歩|歩く|walk/i;

function clockOf(h: string, m: string) {
  return `${h.padStart(2, "0")}:${m}`;
}

function normalize(text: string) {
  return text
    .normalize("NFKC")
    .replace(/(\d{1,2})時(\d{2})分/g, "$1:$2")
    .replace(/\r/g, "");
}

function findDate(text: string, now: Date): string | null {
  const pad = (n: number | string) => String(n).padStart(2, "0");
  const full = /(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/.exec(text);
  if (full) return `${full[1]}-${pad(full[2])}-${pad(full[3])}`;
  const short = /(?:^|[^\d:])(\d{1,2})\s*(?:月\s*(\d{1,2})\s*日|\/(\d{1,2})(?![\d:]))/.exec(text);
  if (!short) return null;
  const month = Number(short[1]);
  const day = Number(short[2] ?? short[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // No year: this year, or next year when that date has already passed.
  let year = now.getFullYear();
  const thisYear = new Date(year, month - 1, day);
  if (thisYear.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) year++;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// "東京 08:52発", "08:52発 東京", "大宮 09:20着 09:25発", "■長野" → name + times.
function stationOf(line: string) {
  const dep = /(\d{1,2}):(\d{2})\s*発/.exec(line);
  const arr = /(\d{1,2}):(\d{2})\s*着/.exec(line);
  const name = line
    .replace(STATION_MARK, "")
    .replace(/(\d{1,2}):(\d{2})\s*(発|着)?/g, " ")
    .replace(/\(?\d+\s*番(線|のりば|乗り場|ホーム)\)?/g, " ")
    .replace(/[()（）[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/駅$/, "");
  return { name, depart: dep ? clockOf(dep[1], dep[2]) : "", arrive: arr ? clockOf(arr[1], arr[2]) : "" };
}

function kindOf(text: string): RideKind {
  if (/(航空|便|空港|ANA|JAL|Peach|ジェットスター|スカイマーク|AIRDO|フライト|flight)/i.test(text) && !/新幹線|線/.test(text)) return "plane";
  if (/(バス|bus|高速バス|路線バス)/i.test(text)) return "bus";
  if (/(フェリー|汽船|船|ferry)/i.test(text)) return "ferry";
  return "train";
}

function platformsOf(text: string) {
  const out = { departPlatform: "", arrivePlatform: "" };
  const re = /(\d+)\s*番(線|のりば|乗り場|ホーム)\s*(発|着)?/g;
  const seen: { label: string; which: string | undefined }[] = [];
  for (const m of text.matchAll(re)) seen.push({ label: `${m[1]}番${m[2] === "ホーム" ? "線" : m[2]}`, which: m[3] });
  for (const p of seen) {
    if (p.which === "着" && !out.arrivePlatform) out.arrivePlatform = p.label;
    else if (p.which === "発" && !out.departPlatform) out.departPlatform = p.label;
  }
  const plain = seen.filter((p) => !p.which);
  if (!out.departPlatform && plain[0]) out.departPlatform = plain.shift()!.label;
  if (!out.arrivePlatform && plain[0]) out.arrivePlatform = plain[0].label;
  return out;
}

// The line name: the ride line that isn't just times / platforms.
function nameOf(lines: string[]) {
  for (const raw of lines) {
    const line = raw
      .replace(RIDE_MARK, "")
      .replace(/\[[^\]]*\d[^\]]*\]/g, "")
      .replace(/(\d{1,2}):(\d{2})\s*(発|着)?/g, "")
      .replace(/\(?\d+\s*番(線|のりば|乗り場|ホーム)\s*(発|着)?\)?/g, "")
      .replace(/^[\s\-–~〜→/／・]+|[\s\-–~〜→/／・]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line && !/^\d/.test(line) && !NOISE.test(line)) return line.slice(0, 60);
  }
  return "";
}

function timesIn(lines: string[]) {
  return lines.flatMap((l) => [...l.matchAll(TIME_G)].map((m) => clockOf(m[1], m[2])));
}

export function parseTransitText(input: string, now = new Date()): ParsedRoute | null {
  const text = normalize(input);
  const date = findDate(text, now);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^https?:\/\//.test(l));

  // Station lines, and the ride lines between each pair of them.
  type Stop = ReturnType<typeof stationOf>;
  const stops: { stop: Stop; between: string[] }[] = [];
  for (const line of lines) {
    const marked = STATION_MARK.test(line);
    // "東京 08:52発" / "長野 10:24着": one time, one place.
    const timed = !marked && !RIDE_MARK.test(line) && !ARROW.test(line) && (line.match(TIME_G)?.length ?? 0) <= 2 && /\d{1,2}:\d{2}\s*[発着]/.test(line);
    if (marked || timed) {
      const stop = stationOf(line);
      if (stop.name && !NOISE.test(stop.name) && !/^\d/.test(stop.name)) {
        stops.push({ stop, between: [] });
        continue;
      }
    }
    if (stops.length > 0 && !NOISE.test(line)) stops[stops.length - 1].between.push(line);
  }

  const rides: ParsedRide[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const block = a.between;
    if (block.some((l) => WALK.test(l)) && !block.some((l) => /線|号|バス|便|フェリー/.test(l))) continue;
    const t = timesIn(block);
    const depart = a.stop.depart || t[0] || "";
    const arrive = b.stop.arrive || (a.stop.depart ? t[0] : t[1]) || "";
    if (!depart) continue;
    const blockText = block.join(" ");
    rides.push({
      kind: kindOf(blockText),
      name: nameOf(block),
      fromName: a.stop.name.slice(0, 60),
      toName: b.stop.name.slice(0, 60),
      depart,
      arrive,
      ...platformsOf(blockText),
    });
  }
  if (rides.length > 0) return { date, rides };

  // One ride written on a line or two: "東京 08:52発 → 長野 10:24着",
  // or a header "東京→長野" with "08:52発 → 10:24着" below.
  const all = timesIn(lines);
  const depM = /(\d{1,2}):(\d{2})\s*発/.exec(text);
  const arrM = /(\d{1,2}):(\d{2})\s*着/.exec(text);
  const depart = depM ? clockOf(depM[1], depM[2]) : all[0];
  if (!depart) return null;
  const arrive = arrM ? clockOf(arrM[1], arrM[2]) : all.find((x) => x !== depart) ?? "";
  // The place written next to each time ("羽田空港 7:30発", "7:30発 羽田空港").
  const PLACE = "([^\\s\\d:→⇒/()（）]{2,30})";
  const placeAt = (mark: string) =>
    new RegExp(`${PLACE}\\s*\\d{1,2}:\\d{2}\\s*${mark}`).exec(text)?.[1] ?? new RegExp(`\\d{1,2}:\\d{2}\\s*${mark}\\s*${PLACE}`).exec(text)?.[1] ?? "";
  let fromName = placeAt("発").replace(/駅$/, "");
  let toName = placeAt("着").replace(/駅$/, "");
  if (NOISE.test(fromName) || NOISE.test(toName)) fromName = toName = "";
  let leftover = "";
  if (fromName && toName) {
    // What's left on that line is the line / flight name ("FDA 3101便").
    const line = lines.find((l) => l.includes(fromName) && l.includes(toName)) ?? "";
    leftover = line
      .replace(/(\d{4}\s*[年/.-]\s*)?\d{1,2}\s*(月\s*\d{1,2}\s*日|\/\d{1,2}(?![\d:]))(\([^)]*\))?/, "")
      .replace(fromName, "")
      .replace(toName, "")
      .replace(/駅/g, "")
      .replace(ARROW, " ");
  }
  for (const line of fromName && toName ? [] : lines) {
    const parts = line.split(ARROW);
    if (parts.length !== 2) continue;
    const [f, to] = parts.map((p) => stationOf(p).name.replace(/^【[^】]*】/, "").trim());
    if (f && to && !/^\d/.test(f) && !/^\d/.test(to) && !NOISE.test(f) && !NOISE.test(to)) {
      fromName = f;
      toName = to;
      break;
    }
  }
  const nameLine = lines.find((l) => /(新幹線|線|号|バス|便|フェリー|特急|快速|急行|ライナー)/.test(l) && !NOISE.test(l) && !ARROW.test(l));
  return {
    date,
    rides: [
      {
        kind: kindOf(text),
        name: nameOf([leftover, ...(nameLine ? [nameLine] : [])].filter(Boolean)),
        fromName: fromName.slice(0, 60),
        toName: toName.slice(0, 60),
        depart,
        arrive,
        ...platformsOf(text),
      },
    ],
  };
}

const minutesOf = (hhmm: string) => {
  const m = TIME.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/**
 * The rides' local date-times ("YYYY-MM-DDTHH:MM", for datetime-local inputs):
 * on `date`, rolling over midnight when a time is earlier than the one
 * before it. A ride without an arrival time gets `fallbackMin` minutes.
 */
export function rideDateTimes(date: string, rides: ParsedRide[], fallbackMin = 60) {
  let dayOffset = 0;
  let last = -1;
  const at = (min: number) => localAt(date, min);
  return rides.map((r) => {
    let dep = minutesOf(r.depart) + dayOffset * 1440;
    if (dep < last) {
      dayOffset++;
      dep += 1440;
    }
    let arr = r.arrive ? minutesOf(r.arrive) + dayOffset * 1440 : dep + fallbackMin;
    if (arr < dep) {
      dayOffset++;
      arr += 1440;
    }
    last = arr;
    return { departAt: at(dep), arriveAt: at(arr) };
  });
}

/** Whether shared text looks like a transit route (two times and a place or line). */
export function looksLikeRoute(text: string) {
  const n = normalize(text);
  return (n.match(TIME_G)?.length ?? 0) >= 2 && /(発|着|→|線|号|乗換|バス|便)/.test(n);
}

/** `min` minutes after midnight of `date` ("YYYY-MM-DD") as a datetime-local value. */
export function localAt(date: string, min: number) {
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() + Math.floor(min / 1440));
  const pad = (n: number) => String(n).padStart(2, "0");
  const m = ((min % 1440) + 1440) % 1440;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * The saved 乗る便 that belong to each しおり leg: the same two places, or
 * leaving between the end of the stay before it and the arrival after it
 * (times in minutes from the first day's midnight). Each one goes to one
 * leg only.
 */
export function transportsForLegs<T extends { id: string; fromName: string; toName: string; departAt: string }>(
  legs: { fromName: string; toName: string; leaveMin: number; arriveMin: number }[],
  transports: T[],
  date: string
) {
  const dayStart = new Date(`${date}T00:00`).getTime();
  const used = new Set<string>();
  const byName = legs.map((leg) => {
    const hits = transports.filter((tr) => !used.has(tr.id) && tr.fromName === leg.fromName && tr.toName === leg.toName);
    hits.forEach((tr) => used.add(tr.id));
    return hits;
  });
  return legs.map((leg, i) => {
    const hits = transports.filter((tr) => {
      if (used.has(tr.id)) return false;
      const min = (new Date(tr.departAt).getTime() - dayStart) / 60_000;
      return min >= leg.leaveMin - 30 && min < leg.arriveMin;
    });
    hits.forEach((tr) => used.add(tr.id));
    return [...byName[i], ...hits];
  });
}
