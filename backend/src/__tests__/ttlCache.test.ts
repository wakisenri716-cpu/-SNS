import { test } from "node:test";
import assert from "node:assert/strict";
import { ttlCache } from "../lib/ttlCache";

test("ttlCache: shares concurrent calls, expires, and doesn't keep failures", async () => {
  const cache = ttlCache<number>(1000, 2);
  let calls = 0;
  const load = async () => ++calls;
  const [a, b] = await Promise.all([cache.get("k", load, 0), cache.get("k", load, 0)]);
  assert.deepEqual([a, b, calls], [1, 1, 1]);
  assert.equal(await cache.get("k", load, 999), 1);
  assert.equal(await cache.get("k", load, 1000), 2);

  await assert.rejects(cache.get("bad", () => Promise.reject(new Error("x")), 0));
  await new Promise((r) => setImmediate(r));
  assert.equal(await cache.get("bad", async () => 7, 0), 7);

  // Over the limit, the oldest entry goes.
  await cache.get("c", load, 0);
  assert.equal(cache.size, 2);
});
