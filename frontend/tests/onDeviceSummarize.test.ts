// みんなの声をまとめる: what is handed to the on-device model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commentsForSummary } from "../src/lib/summaryInput.ts";

test("commentsForSummary: one bullet per comment, whitespace folded, cut to fit", () => {
  assert.equal(commentsForSummary(["景色が  最高\nでした", "  ", "駐車場が混む"]), "- 景色が 最高 でした\n- 駐車場が混む");
  const long = commentsForSummary(["a".repeat(30), "b".repeat(30), "c".repeat(30)], 70);
  assert.equal(long.split("\n").length, 2);
  assert.ok(long.length <= 70);
});

test("outputLanguageOf: Japanese text stays Japanese", async () => {
  const { outputLanguageOf } = await import("../src/lib/onDeviceRewrite.ts");
  assert.equal(outputLanguageOf("松本城の朝"), "ja");
  assert.equal(outputLanguageOf("カフェ open 9am"), "ja");
  assert.equal(outputLanguageOf("Morning at the castle"), "en");
});
