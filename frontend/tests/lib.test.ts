// Unit tests for the frontend's pure helpers: node --test (Node strips the
// TypeScript types itself), run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventIcs, buildItineraryIcs } from "../src/lib/ics.ts";
import { distanceKm, formatDistance } from "../src/lib/geo.ts";
import { formatStampDate } from "../src/lib/stampDate.ts";

test("ics: one event per stop, Tokyo time, escaped text", () => {
  const ics = buildItineraryIcs(
    "2026-11-03",
    [
      { title: "松本城; 天守", location: "松本市, 長野県", lat: 36.2391, lng: 137.9691, url: "https://jaziba.jp/reels/a/access", start: 9 * 60, end: 10 * 60 },
      { title: "夜の宿", location: "上高地", lat: 36.24, lng: 137.63, url: "https://jaziba.jp/reels/b/access", start: 23 * 60 + 30, end: 24 * 60 + 30 },
    ],
    new Date("2026-10-28T00:00:00Z")
  );
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:20261103T090000/);
  assert.match(ics, /SUMMARY:松本城\\; 天守/);
  assert.match(ics, /LOCATION:松本市\\, 長野県/);
  // A stay running past midnight ends on the next day.
  assert.match(ics, /DTEND;TZID=Asia\/Tokyo:20261104T003000/);
  assert.ok(ics.includes("\r\n"));
});

test("geo: distance and formatting", () => {
  const km = distanceKm({ lat: 36.2391, lng: 137.9691 }, { lat: 36.251, lng: 137.6389 });
  assert.ok(km > 29 && km < 31, `got ${km}`);
  assert.equal(formatDistance(0.048), "48m");
  assert.equal(formatDistance(4.26), "4.3km");
  assert.equal(formatDistance(29.7), "30km");
});

test("stamp date", () => {
  assert.equal(formatStampDate("2026-03-05T12:00:00"), "2026.03.05");
});

test("event ics: all-day, end date exclusive", () => {
  const ics = buildEventIcs({ title: "夜市", description: "", startDate: "2026-12-31", endDate: "2027-01-01", locationName: "松本城公園", url: "" });
  assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
  assert.match(ics, /DTEND;VALUE=DATE:20270102/);
  assert.doesNotMatch(ics, /DESCRIPTION/);
});

test("itinerary timeline: travel and stays accumulate, past midnight counts as the next day", async () => {
  const { computeTimeline, splitClock } = await import("../src/lib/itineraryTimeline.ts");
  const { departAt, times } = computeTimeline("22:00", 30, [60, 90], [45]);
  assert.equal(departAt, 22 * 60);
  assert.deepEqual(times, [
    { arrive: 22 * 60 + 30, leave: 23 * 60 + 30, day: 0 },
    { arrive: 24 * 60 + 15, leave: 25 * 60 + 45, day: 1 },
  ]);
  assert.deepEqual(splitClock(times[1].leave), { day: 1, time: "01:45" });
  assert.equal(computeTimeline("bad", null, [0], []).departAt, 9 * 60);
});

test("見頃: month runs wrap around the new year and format per language", async () => {
  const { formatBestMonths, isInSeason, monthInJapan, monthRuns } = await import("../src/lib/season.ts");
  assert.deepEqual(monthRuns([10, 5, 6]), [[5, 6], [10, 10]]);
  assert.deepEqual(monthRuns([1, 2, 12]), [[12, 2]]);
  assert.deepEqual(monthRuns([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), [[1, 12]]);
  assert.equal(formatBestMonths([5, 6, 10], "ja"), "5月–6月・10月");
  assert.equal(formatBestMonths([12, 1], "en"), "Dec–Jan");
  // 23:30 UTC on Mar 31 is already April in Japan.
  const lateMarchUtc = new Date("2026-03-31T23:30:00Z");
  assert.equal(monthInJapan(lateMarchUtc), 4);
  assert.equal(isInSeason([4], lateMarchUtc), true);
});

test("itinerary timeline: a place to stay mid-trip means leaving the next morning", async () => {
  const { computeTimeline, formatClock, overnightStops } = await import("../src/lib/itineraryTimeline.ts");
  const stops = [{ category: "culture" }, { category: "lodging" }, { category: "nature" }, { category: "lodging" }];
  const overnight = overnightStops(stops);
  // The last stop is where the trip ends, not a night.
  assert.deepEqual(overnight, [false, true, false, false]);
  const { times } = computeTimeline("09:00", null, [120, 60, 90, 60], [300, 60, 30], overnight);
  // Castle 9–11, inn at 16:00, out at 9:00 the next day, river at 10:00.
  assert.deepEqual(times[1], { arrive: 16 * 60, leave: 24 * 60 + 9 * 60, day: 0 });
  assert.deepEqual(times[2], { arrive: 24 * 60 + 10 * 60, leave: 24 * 60 + 11 * 60 + 30, day: 1 });
  // Arriving at 5:00 leaves too little rest before 9:00, so it's the morning after.
  const late = computeTimeline("09:00", null, [0], [], [true]);
  assert.equal(computeTimeline("09:00", 20 * 60, [0], [], [true]).times[0].leave, 2 * 24 * 60 + 9 * 60);
  assert.equal(late.times[0].leave, 24 * 60 + 9 * 60);
  const t = (key: string, o?: Record<string, unknown>) => `${key}:${JSON.stringify(o)}`;
  assert.equal(formatClock(24 * 60 + 9 * 60, t, 1), "09:00");
  assert.equal(formatClock(24 * 60 + 9 * 60, t, 0), 'itinerary.nextDay:{"time":"09:00"}');
  assert.equal(formatClock(2 * 24 * 60, t, 0), 'itinerary.dayTime:{"day":3,"time":"00:00"}');
});

test("compass: bearings and the eight points", async () => {
  const { bearingDeg, compassPoint } = await import("../src/lib/geo.ts");
  const castle = { lat: 36.2391, lng: 137.9691 };
  assert.ok(Math.abs(bearingDeg(castle, { lat: 36.3, lng: 137.9691 }) - 0) < 0.01);
  assert.ok(Math.abs(bearingDeg(castle, { lat: 36.2391, lng: 138.0 }) - 90) < 0.1);
  assert.ok(Math.abs(bearingDeg(castle, { lat: 36.2, lng: 137.9691 }) - 180) < 0.01);
  assert.equal(compassPoint(350), 0);
  assert.equal(compassPoint(44), 1);
  assert.equal(compassPoint(270), 6);
  assert.equal(compassPoint(-90), 6);
});

test("recently viewed: newest first, each spot once, at most 12", async () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  const { addRecentlyViewed, clearRecentlyViewed, getRecentlyViewed } = await import("../src/lib/recentlyViewed.ts");
  const item = (id: string) => ({ id, videoUrl: `/v/${id}`, place: id, municipality: "松本市" });
  for (let i = 0; i < 15; i++) addRecentlyViewed(item(`r${i}`));
  addRecentlyViewed(item("r5"));
  const ids = getRecentlyViewed().map((x) => x.id);
  assert.equal(ids.length, 12);
  assert.deepEqual(ids.slice(0, 3), ["r5", "r14", "r13"]);
  assert.equal(ids.filter((x) => x === "r5").length, 1);
  store.set("jaziba-recently-viewed", "not json");
  assert.deepEqual(getRecentlyViewed(), []);
  clearRecentlyViewed();
  assert.deepEqual(getRecentlyViewed(), []);
});

test("first-visit language follows the browser's preferences", async () => {
  const { detectLanguage } = await import("../src/lib/detectLanguage.ts");
  assert.equal(detectLanguage(["en-US", "ja"]), "en");
  assert.equal(detectLanguage(["zh-TW"]), "zh");
  assert.equal(detectLanguage(["fr-FR", "ko-KR"]), "ko");
  assert.equal(detectLanguage(["fr-FR", "de"]), "ja");
  assert.equal(detectLanguage(["ja-JP", "en"]), "ja");
});

test("旅行中モード: before, at a stop, moving to the next, done", async () => {
  const { liveStatus, minutesSince } = await import("../src/lib/liveTrip.ts");
  const times = [
    { arrive: 9 * 60, leave: 10 * 60 },
    { arrive: 10 * 60 + 30, leave: 12 * 60 },
  ];
  assert.deepEqual(liveStatus(times, 8 * 60 + 30, 8 * 60), { kind: "before", minutes: 30 });
  assert.deepEqual(liveStatus(times, 8 * 60 + 30, 8 * 60 + 45), { kind: "moving", index: 0, minutes: 15 });
  assert.deepEqual(liveStatus(times, 8 * 60 + 30, 9 * 60 + 35), { kind: "at", index: 0, minutes: 25 });
  assert.deepEqual(liveStatus(times, 8 * 60 + 30, 10 * 60 + 10), { kind: "moving", index: 1, minutes: 20 });
  assert.deepEqual(liveStatus(times, 8 * 60 + 30, 13 * 60), { kind: "done" });
  // Day 2 counts on from the first midnight.
  assert.equal(minutesSince("2026-11-03", new Date(2026, 10, 4, 9, 15)), 24 * 60 + 9 * 60 + 15);
});

import { angleDiff, cameraHeading, project, spread } from "../src/lib/arProjection.ts";

test("AR: the camera heading of an upright phone follows where it points", () => {
  // Upright (beta 90), not rolled: alpha 0 faces north, alpha 90 (turned left) faces west.
  assert.ok(Math.abs(cameraHeading(0, 90, 0) - 0) < 1e-6 || Math.abs(cameraHeading(0, 90, 0) - 360) < 1e-6);
  assert.ok(Math.abs(cameraHeading(90, 90, 0) - 270) < 1e-6);
  assert.ok(Math.abs(cameraHeading(270, 90, 0) - 90) < 1e-6);
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(350, 10), -20);
  assert.equal(angleDiff(180, 0), 180);
});

test("AR: spots ahead are in view, behind are not, and nearer ones sit lower and bigger", () => {
  const me = { lat: 36.2, lng: 137.9 };
  const spots = [
    { id: "north-near", lat: 36.205, lng: 137.9 },
    { id: "north-far", lat: 36.25, lng: 137.9 },
    { id: "east", lat: 36.2, lng: 137.95 },
    { id: "south", lat: 36.15, lng: 137.9 },
    { id: "too-far", lat: 37.5, lng: 137.9 },
  ];
  const facingNorth = project(me, 0, 90, spots, 10);
  assert.deepEqual(facingNorth.map((p) => p.spot.id), ["north-near", "east", "north-far", "south"]);
  const byId = Object.fromEntries(facingNorth.map((p) => [p.spot.id, p]));
  assert.ok(byId["north-near"].inView && byId["north-far"].inView);
  assert.ok(!byId.east.inView && !byId.south.inView);
  assert.ok(Math.abs(byId["north-near"].x - 0.5) < 0.01);
  assert.ok(byId["north-near"].y > byId["north-far"].y);
  assert.ok(byId["north-near"].scale > byId["north-far"].scale);
  // Turn to face east: now the east spot is in the middle.
  const east = project(me, 90, 90, spots, 10).find((p) => p.spot.id === "east")!;
  assert.ok(east.inView && Math.abs(east.x - 0.5) < 0.02);
  // Tilting the phone up moves things down the screen.
  const up = project(me, 0, 110, spots, 10).find((p) => p.spot.id === "north-near")!;
  assert.ok(up.y > byId["north-near"].y);
});

test("AR: overlapping labels are stacked instead of covering each other", () => {
  const out = spread([
    { x: 0.5, y: 0.5 },
    { x: 0.52, y: 0.5 },
    { x: 0.9, y: 0.5 },
  ]);
  assert.equal(out[0].y, 0.5);
  assert.ok(out[1].y < 0.5 - 0.08);
  assert.equal(out[2].y, 0.5);
});

import { addDays, forecastWindow } from "../src/lib/weather.ts";

test("weather: trip days map to dates, and only trips within the forecast range get one", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  const now = new Date(2026, 9, 29, 12);
  assert.equal(forecastWindow("2026-10-29", now), "inRange");
  assert.equal(forecastWindow("2026-11-13", now), "inRange");
  assert.equal(forecastWindow("2026-11-14", now), "tooFar");
  assert.equal(forecastWindow("2026-10-20", now), "inRange");
  assert.equal(forecastWindow("2026-10-01", now), "past");
});

import { coordsInText, readExifGps } from "../src/lib/exifGps.ts";

// A minimal JPEG with an EXIF GPS block (big-endian TIFF), like a phone writes.
function jpegWithGps(lat: [number, number, number], latRef: string, lng: [number, number, number], lngRef: string) {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v >> 8, v & 255);
  const u32 = (v: number) => tiff.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  // Header, IFD0 at 8 with one entry (GPS pointer), then the GPS IFD at 26.
  tiff.push(0x4d, 0x4d); u16(42); u32(8);
  u16(1); u16(0x8825); u16(4); u32(1); u32(26); u32(0);
  // GPS IFD: 4 entries; rationals start after it at 26 + 2 + 4*12 + 4 = 80.
  u16(4);
  u16(1); u16(2); u32(2); tiff.push(latRef.charCodeAt(0), 0, 0, 0);
  u16(2); u16(5); u32(3); u32(80);
  u16(3); u16(2); u32(2); tiff.push(lngRef.charCodeAt(0), 0, 0, 0);
  u16(4); u16(5); u32(3); u32(104);
  u32(0);
  for (const v of [...lat, ...lng]) { u32(Math.round(v * 100)); u32(100); }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...exif, 0xff, 0xda, 0, 2]).buffer;
}

test("photo location: EXIF GPS is read from a JPEG, and its absence gives null", () => {
  const at = readExifGps(jpegWithGps([36, 14, 20.76], "N", [137, 58, 8.76], "E"))!;
  assert.ok(Math.abs(at.lat - 36.2391) < 1e-4 && Math.abs(at.lng - 137.9691) < 1e-4);
  const west = readExifGps(jpegWithGps([40, 42, 46], "N", [74, 0, 22], "W"))!;
  assert.ok(west.lng < 0);
  assert.equal(readExifGps(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), null);
  assert.equal(readExifGps(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
});

test("shared map links: coordinates are found in the usual URL forms", () => {
  assert.deepEqual(coordsInText("https://www.google.com/maps/place/x/@36.2391,137.9691,17z"), { lat: 36.2391, lng: 137.9691 });
  assert.deepEqual(coordsInText("https://maps.google.com/?q=36.2391,137.9691"), { lat: 36.2391, lng: 137.9691 });
  assert.deepEqual(coordsInText("https://maps.apple.com/?ll=36.2391,137.9691&q=Castle"), { lat: 36.2391, lng: 137.9691 });
  assert.deepEqual(coordsInText("ここ 36.2391, 137.9691"), { lat: 36.2391, lng: 137.9691 });
  assert.equal(coordsInText("https://maps.app.goo.gl/abc123"), null);
  assert.equal(coordsInText("松本城に行きたい"), null);
});

import { googleTransitUrl, statusUrl, yahooTransitUrl } from "../src/lib/transitLinks.ts";

test("transit links: Google Maps by public transport, Yahoo!乗換案内, and status pages", () => {
  const g = new URL(googleTransitUrl({ name: "松本駅", lat: 36.2305, lng: 137.9639 }, { name: "上高地 河童橋", lat: 36.251, lng: 137.6389 }));
  assert.equal(g.origin + g.pathname, "https://www.google.com/maps/dir/");
  assert.equal(g.searchParams.get("origin"), "36.2305,137.9639");
  assert.equal(g.searchParams.get("destination"), "36.251,137.6389");
  assert.equal(g.searchParams.get("travelmode"), "transit");
  assert.equal(new URL(googleTransitUrl({ name: "新宿" }, { name: "松本" })).searchParams.get("origin"), "新宿");
  const y = new URL(yahooTransitUrl("新宿", "松本"));
  assert.equal(y.searchParams.get("from"), "新宿");
  assert.equal(y.searchParams.get("to"), "松本");
  assert.equal(statusUrl("train", "あずさ5号", "JR東日本"), "https://transit.yahoo.co.jp/diainfo");
  assert.equal(new URL(statusUrl("plane", "JL123", "日本航空")).searchParams.get("q"), "JL123 運航状況");
  assert.equal(new URL(statusUrl("bus", "上高地線", "アルピコ交通")).searchParams.get("q"), "アルピコ交通 上高地線 運行情報");
});

import { currentTransport, isoToLocalInput, localInputToIso, splitDuration, transportPhase } from "../src/lib/transportTiming.ts";

test("移動中モード: phases, progress and which trip to show", () => {
  const flight = { departAt: "2026-11-03T08:00:00+09:00", arriveAt: "2026-11-03T09:00:00+09:00" };
  const t = (iso: string) => new Date(iso).getTime();
  assert.equal(transportPhase(flight, t("2026-11-03T05:00:00+09:00")).phase, "later");
  assert.equal(transportPhase(flight, t("2026-11-03T07:30:00+09:00")).phase, "soon");
  const mid = transportPhase(flight, t("2026-11-03T08:30:00+09:00"));
  assert.equal(mid.phase, "enroute");
  assert.equal(mid.progress, 0.5);
  assert.equal(mid.toArriveMs, 30 * 60_000);
  assert.equal(transportPhase(flight, t("2026-11-03T09:00:01+09:00")).phase, "arrived");

  const train = { departAt: "2026-11-03T10:30:00+09:00", arriveAt: "2026-11-03T12:00:00+09:00" };
  assert.equal(currentTransport([train, flight], t("2026-11-03T08:10:00+09:00")), flight);
  assert.equal(currentTransport([train, flight], t("2026-11-03T09:30:00+09:00")), train);
  assert.equal(currentTransport([train, flight], t("2026-11-04T00:00:00+09:00")), train);
  assert.equal(currentTransport([], Date.now()), null);

  assert.deepEqual(splitDuration((2 * 3600 + 5 * 60 + 9) * 1000), { h: 2, m: 5, s: 9 });
  assert.deepEqual(splitDuration(-5), { h: 0, m: 0, s: 0 });
  assert.equal(isoToLocalInput(localInputToIso("2026-11-03T08:05")), "2026-11-03T08:05");
});
