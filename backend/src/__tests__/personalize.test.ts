import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTravelStyle, parseFavoriteCategories, scoreReel } from "../lib/personalize";

const noStyle = { travelCompanion: null, needsBarrierFree: false, needsMultilingual: false, favoriteCategories: "" };

test("parseFavoriteCategories keeps only known categories, in canonical order", () => {
  assert.deepEqual(parseFavoriteCategories("restaurant, bogus,nature"), ["nature", "restaurant"]);
});

test("hasTravelStyle is false until something is set", () => {
  assert.equal(hasTravelStyle(noStyle), false);
  assert.equal(hasTravelStyle({ ...noStyle, travelCompanion: "family" }), true);
});

test("an access need outranks a taste", () => {
  const style = { ...noStyle, needsBarrierFree: true, favoriteCategories: "nature" };
  const accessible = scoreReel({ category: "culture", travelerTags: "barrierFree" }, style);
  const scenic = scoreReel({ category: "nature", travelerTags: "" }, style);
  assert.ok(accessible.score > scenic.score);
  assert.deepEqual(accessible.reasons, ["barrierFree"]);
  assert.deepEqual(scenic.reasons, ["favoriteCategory"]);
});

test("companion maps to the matching traveler tag", () => {
  const { reasons } = scoreReel({ category: "lodging", travelerTags: "couples" }, { ...noStyle, travelCompanion: "couple" });
  assert.deepEqual(reasons, ["companion"]);
});
