import { test } from "node:test";
import assert from "node:assert/strict";
import { composeTrip, wantedDays, type ComposeCandidate } from "../services/tripComposer";

delete process.env.ANTHROPIC_API_KEY;

const base = { travelerTags: [], bestMonths: [] } as const;
const posts: ComposeCandidate[] = [
  { ...base, id: "castle", caption: "国宝 松本城", category: "culture", locationName: "松本城", municipalityName: "松本市", prefecture: "長野県", lat: 36.2381, lng: 137.9689 },
  { ...base, id: "soba", caption: "信州そば", category: "restaurant", locationName: "そば処", municipalityName: "松本市", prefecture: "長野県", lat: 36.235, lng: 137.97 },
  { ...base, id: "onsen", caption: "源泉かけ流しの温泉宿", category: "lodging", locationName: "浅間温泉の宿", municipalityName: "松本市", prefecture: "長野県", lat: 36.25, lng: 137.99 },
  { ...base, id: "kamikochi", caption: "穂高連峰の絶景", category: "nature", locationName: "上高地 河童橋", municipalityName: "松本市", prefecture: "長野県", lat: 36.2507, lng: 137.6376 },
  { ...base, id: "inn", caption: "山の宿", category: "lodging", locationName: "上高地の宿", municipalityName: "松本市", prefecture: "長野県", lat: 36.249, lng: 137.64 },
  // Far away: must not be pulled into a 長野 trip.
  { ...base, id: "okinawa", caption: "美ら海の絶景と温泉", category: "nature", locationName: "美ら海", municipalityName: "本部町", prefecture: "沖縄県", lat: 26.694, lng: 127.878 },
];

test("reads the length of the trip in any of the four languages", () => {
  assert.equal(wantedDays("2泊3日で長野"), 3);
  assert.equal(wantedDays("二泊三日"), 3);
  assert.equal(wantedDays("１泊で温泉"), 2);
  assert.equal(wantedDays("3日間のんびり"), 3);
  assert.equal(wantedDays("日帰りで松本"), 1);
  assert.equal(wantedDays("4月10日に松本"), 1);
  assert.equal(wantedDays("3 days in Nagano"), 3);
  assert.equal(wantedDays("2 nights"), 3);
  assert.equal(wantedDays("长野3天"), 3);
  assert.equal(wantedDays("2박3일 나가노"), 3);
  assert.equal(wantedDays("30泊"), 7);
});

test("without an API key a trip is built by keyword, labeled as such, one area only", async () => {
  const result = await composeTrip("1泊2日で松本、お城と温泉", "ja", posts);
  assert.equal(result.mode, "keyword");
  assert.equal(result.summary, null);
  assert.equal(result.requestedDays, 2);
  const ids = result.stops.map((s) => s.id);
  assert.ok(!ids.includes("okinawa"));
  assert.ok(ids.includes("castle"));
  // The night's stay ends day 1; whatever follows is day 2.
  const stay = result.stops.findIndex((s) => s.id === "onsen" || s.id === "inn");
  assert.ok(stay >= 0);
  assert.ok(result.stops.slice(0, stay + 1).every((s) => s.day === 1));
  assert.ok(result.stops.slice(stay + 1).every((s) => s.day === 2));
  assert.ok(result.stops.every((s) => s.reason === null && s.matched !== null));
});

test("a day trip only includes a place to stay when asked for one", async () => {
  const day = await composeTrip("日帰りで松本城とそば", "ja", posts);
  assert.ok(day.stops.every((s) => s.day === 1));
  assert.ok(!day.stops.some((s) => s.id === "onsen" || s.id === "inn"));
});

test("nothing matching gives an empty trip rather than random posts", async () => {
  const result = await composeTrip("宇宙旅行", "ja", posts);
  assert.deepEqual(result.stops, []);
});
