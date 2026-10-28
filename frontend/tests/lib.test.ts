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
    { arrive: 22 * 60 + 30, leave: 23 * 60 + 30 },
    { arrive: 24 * 60 + 15, leave: 25 * 60 + 45 },
  ]);
  assert.deepEqual(splitClock(times[1].leave), { day: 1, time: "01:45" });
  assert.equal(computeTimeline("bad", null, [0], []).departAt, 9 * 60);
});
