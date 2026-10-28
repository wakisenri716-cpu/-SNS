import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeByOriginAndMode, summarizeOrigins } from "../lib/travelReports";

const report = (userId: string, originLabel: string, mode = "train", durationMin = 60) => ({ userId, originLabel, mode, durationMin });

test("an origin reported by only one person is never shown (privacy)", () => {
  const { summary, hiddenCount } = summarizeByOriginAndMode([report("u1", "自宅のある町"), report("u1", "自宅のある町")]);
  assert.deepEqual(summary, []);
  assert.equal(hiddenCount, 2);
});

test("an origin shared by two different people is shown with averages", () => {
  const { summary, hiddenCount } = summarizeByOriginAndMode([
    report("u1", "東京駅", "train", 150),
    report("u2", "東京駅", "train", 170),
    report("u3", "どこか", "car", 10),
  ]);
  assert.equal(hiddenCount, 1);
  assert.deepEqual(summary, [{ originLabel: "東京駅", mode: "train", count: 2, averageMin: 160 }]);
});

test("summarizeOrigins counts modes per shown origin only", () => {
  const result = summarizeOrigins([report("u1", "名古屋駅", "train"), report("u2", "名古屋駅", "car"), report("u3", "秘密", "walk")]);
  assert.equal(result.hiddenCount, 1);
  assert.equal(result.origins.length, 1);
  assert.equal(result.origins[0].originLabel, "名古屋駅");
  assert.equal(result.origins[0].reportCount, 2);
});
