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
