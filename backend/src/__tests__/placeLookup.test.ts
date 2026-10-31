// 出発地点を探す with the built-in data (no Maps key); town data mocked.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { lookupBuiltIn } from "../services/placeLookup";

delete process.env.GOOGLE_MAPS_API_KEY;

test("stations anywhere in Japan, with or without 駅, and the right one of a shared name", async () => {
  assert.deepEqual(await lookupBuiltIn("東京駅"), { lat: 35.68098, lng: 139.76662, label: "東京駅（東京都）", kind: "station" });
  assert.equal((await lookupBuiltIn("ＪＲ松本駅"))?.label, "松本駅（長野県）");
  assert.equal((await lookupBuiltIn("羽田空港第1・第2ターミナル駅"))?.kind, "station");
  // 府中 is in Tokyo, Hiroshima, Tokushima, Kyoto: the busiest unless the prefecture says.
  assert.equal((await lookupBuiltIn("府中駅"))?.label, "府中駅（東京都）");
  assert.equal((await lookupBuiltIn("広島県府中駅"))?.label, "府中駅（広島県）");
});

test("cities, towns, wards and prefectures, by full or bare name", async () => {
  assert.equal((await lookupBuiltIn("長野県松本市"))?.label, "松本市（長野県）");
  assert.equal((await lookupBuiltIn("松本"))?.label, "松本市（長野県）");
  assert.equal((await lookupBuiltIn("白馬村"))?.kind, "municipality");
  assert.equal((await lookupBuiltIn("新宿"))?.label, "新宿区（東京都）");
  assert.equal((await lookupBuiltIn("長野市"))?.label, "長野市（長野県）");
  const pref = await lookupBuiltIn("北海道");
  assert.equal(pref?.kind, "prefecture");
  assert.ok(Math.abs(pref!.lat - 43.06) < 0.05);
  assert.equal(await lookupBuiltIn("宇宙ステーション"), null);
  assert.equal(await lookupBuiltIn("   "), null);
});

test("an address below the city is placed at its 町・丁目, and falls back to the city", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (url: URL | string) => {
    assert.match(decodeURIComponent(String(url)), /\/東京都\/渋谷区\.json$/);
    return new Response(JSON.stringify([
      { town: "道玄坂一丁目", koaza: "", lat: 35.6577, lng: 139.6982 },
      { town: "道玄坂二丁目", koaza: "", lat: 35.6594, lng: 139.6983 },
    ]));
  });
  try {
    assert.deepEqual(await lookupBuiltIn("渋谷区道玄坂2-1"), { lat: 35.6594, lng: 139.6983, label: "東京都渋谷区道玄坂二丁目", kind: "town" });
    assert.equal((await lookupBuiltIn("東京都渋谷区道玄坂二丁目3番"))?.label, "東京都渋谷区道玄坂二丁目");
  } finally {
    fetchMock.mock.restore();
  }
  const failing = mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));
  try {
    assert.equal((await lookupBuiltIn("大阪市北区梅田1丁目"))?.label, "大阪市北区（大阪府）");
  } finally {
    failing.mock.restore();
  }
});
