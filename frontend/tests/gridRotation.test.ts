// おすすめ 9マス: 2 定番, 3 注目, 4 穴場, rotating without repeats on screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GRID_LAYOUT, GridRotation, swapOrder } from "../src/lib/gridRotation.ts";

const posts = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

test("the layout has 2 定番, 3 注目 and 4 穴場", () => {
  assert.equal(GRID_LAYOUT.length, 9);
  assert.deepEqual(
    ["famous", "middle", "hidden"].map((t) => GRID_LAYOUT.filter((x) => x === t).length),
    [2, 3, 4]
  );
});

test("fill: each square from its own pool, nothing twice", () => {
  const rotation = new GridRotation({ famous: posts("f", 5), middle: posts("m", 5), hidden: posts("h", 8) });
  const cells = rotation.fill();
  assert.deepEqual(
    cells.map((c) => c!.tier),
    [...GRID_LAYOUT]
  );
  assert.equal(new Set(cells.map((c) => c!.item.id)).size, 9);
});

test("take: the next post of the pool that isn't on screen, cycling", () => {
  const rotation = new GridRotation({ famous: posts("f", 3), middle: posts("m", 3), hidden: posts("h", 4) });
  const cells = rotation.fill();
  const onScreen = new Set(cells.map((c) => c!.item.id));
  const next = rotation.take("famous", onScreen)!;
  assert.equal(next.tier, "famous");
  assert.equal(next.item.id, "f2");
  onScreen.add("f2");
  // Every 定番 on screen: borrows from 注目, then 穴場 (which are all shown too here except none).
  assert.equal(rotation.take("famous", onScreen), null);
});

test("a small pool borrows from the nearest one", () => {
  const rotation = new GridRotation({ famous: [], middle: posts("m", 2), hidden: posts("h", 10) });
  const cells = rotation.fill();
  assert.equal(cells.filter((c) => c?.tier === "famous").length, 0);
  assert.equal(cells.filter((c) => c?.tier === "middle").length, 2);
  assert.equal(cells.filter((c) => c?.tier === "hidden").length, 7);
  assert.equal(new GridRotation({ famous: [], middle: [], hidden: posts("h", 4) }).fill().filter(Boolean).length, 4);
});

test("swapOrder: every square once", () => {
  assert.deepEqual([...swapOrder(9)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});
