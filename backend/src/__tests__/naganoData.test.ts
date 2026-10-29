// The Nagano municipality data (src/data/naganoMunicipalities.ts) is sound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAGANO_MUNICIPALITIES } from "../data/naganoMunicipalities";

test("長野県: all 77 municipalities, each once, with an office inside the prefecture", () => {
  assert.equal(NAGANO_MUNICIPALITIES.length, 77);
  assert.equal(new Set(NAGANO_MUNICIPALITIES.map((m) => m.lgCode)).size, 77);
  assert.equal(new Set(NAGANO_MUNICIPALITIES.map((m) => m.name)).size, 77);
  const kinds = { 市: 0, 町: 0, 村: 0 } as Record<string, number>;
  for (const m of NAGANO_MUNICIPALITIES) {
    kinds[m.name.slice(-1)]++;
    assert.match(m.lgCode, /^20\d{4}$/);
    assert.ok(m.lat > 35.1 && m.lat < 37.1 && m.lng > 137.3 && m.lng < 138.9, m.name);
    assert.match(m.url, /^https?:\/\//);
  }
  // 19 cities, 23 towns, 35 villages.
  assert.deepEqual(kinds, { 市: 19, 町: 23, 村: 35 });
});

test("長野県: sights are unique per municipality, and any position is near it", () => {
  for (const m of NAGANO_MUNICIPALITIES) {
    assert.equal(new Set(m.spots.map((s) => s.name)).size, m.spots.length, m.name);
    for (const s of m.spots) {
      assert.ok(s.description.length > 5, s.name);
      if (s.lat == null) continue;
      // Mountains and lakes can sit on a border, but not far from the town
      // (松本市 reaches 乗鞍岳, ~41 km from its city hall).
      const km = Math.hypot((s.lat - m.lat) * 111, (s.lng! - m.lng) * 90);
      assert.ok(km < 50, `${m.name} ${s.name} ${km.toFixed(1)}km`);
    }
  }
});
