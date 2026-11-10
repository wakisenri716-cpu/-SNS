// 場所を選ぶ: labels for map-data results and names of tapped map labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { featureName, osmClassKey } from "../src/lib/placePick.ts";

test("osmClassKey: OSM class → label key, unknown → generic", () => {
  assert.equal(osmClassKey("historic/castle"), "place.osmClass.historic");
  assert.equal(osmClassKey("natural/waterfall"), "place.osmClass.natural");
  assert.equal(osmClassKey("man_made/tower"), "place.source.osm");
  assert.equal(osmClassKey(undefined), "place.source.osm");
});

test("featureName: Japanese name first, then the local name", () => {
  assert.equal(featureName({ "name:ja": "松本城", name: "Matsumoto Castle" }), "松本城");
  assert.equal(featureName({ name: " 善光寺 " }), "善光寺");
  assert.equal(featureName({ class: "castle" }), "");
  assert.equal(featureName(null), "");
});
