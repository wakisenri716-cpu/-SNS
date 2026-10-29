// 天気予報 with Open-Meteo mocked: how its answer is read, cached and limited.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { forecastAt, isWetDay, kindOf } from "../services/weather";

test("WMO weather codes map to the kinds the UI shows", () => {
  assert.equal(kindOf(0), "clear");
  assert.equal(kindOf(2), "partly");
  assert.equal(kindOf(45), "fog");
  assert.equal(kindOf(53), "drizzle");
  assert.equal(kindOf(63), "rain");
  assert.equal(kindOf(81), "rain");
  assert.equal(kindOf(73), "snow");
  assert.equal(kindOf(95), "thunder");
  assert.ok(isWetDay({ date: "x", code: 63, kind: "rain", tMax: 10, tMin: 5, pop: 20 }));
  assert.ok(isWetDay({ date: "x", code: 3, kind: "cloudy", tMax: 10, tMin: 5, pop: 70 }));
  assert.ok(!isWetDay({ date: "x", code: 1, kind: "clear", tMax: 10, tMin: 5, pop: 10 }));
});

test("a forecast is read per date, cached per area, and missing dates or failures give null", async () => {
  let calls = 0;
  let lastUrl = "";
  const fetchMock = mock.method(globalThis, "fetch", async (url: URL) => {
    calls++;
    lastUrl = String(url);
    return new Response(
      JSON.stringify({
        daily: {
          time: ["2026-11-03", "2026-11-04"],
          weather_code: [1, 63],
          temperature_2m_max: [17.6, 12.2],
          temperature_2m_min: [6.4, 8.9],
          precipitation_probability_max: [5, 90],
        },
      })
    );
  });
  try {
    assert.deepEqual(await forecastAt(36.238, 137.969, "2026-11-04"), { date: "2026-11-04", code: 63, kind: "rain", tMax: 12, tMin: 9, pop: 90 });
    // A nearby point (same ~10 km cell) is served from the cache.
    assert.equal((await forecastAt(36.22, 137.98, "2026-11-03"))?.kind, "clear");
    assert.equal(calls, 1);
    assert.match(lastUrl, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=36\.20&longitude=138\.00&/);
    assert.match(lastUrl, /timezone=Asia%2FTokyo/);
    assert.equal(await forecastAt(36.238, 137.969, "2026-12-25"), null);
  } finally {
    fetchMock.mock.restore();
  }
  const failing = mock.method(globalThis, "fetch", async () => new Response("down", { status: 503 }));
  const quiet = mock.method(console, "warn", () => {});
  try {
    assert.equal(await forecastAt(43.06, 141.35, "2026-11-03"), null);
  } finally {
    failing.mock.restore();
    quiet.mock.restore();
  }
});

test("with OPEN_METEO_API_KEY the paid customer endpoint is used", async () => {
  process.env.OPEN_METEO_API_KEY = "test-key";
  let lastUrl = "";
  const fetchMock = mock.method(globalThis, "fetch", async (url: URL) => {
    lastUrl = String(url);
    return new Response(JSON.stringify({ daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [] } }));
  });
  try {
    await forecastAt(26.2, 127.7, "2026-11-03");
    assert.match(lastUrl, /^https:\/\/customer-api\.open-meteo\.com\/v1\/forecast\?.*apikey=test-key/);
  } finally {
    fetchMock.mock.restore();
    delete process.env.OPEN_METEO_API_KEY;
  }
});
