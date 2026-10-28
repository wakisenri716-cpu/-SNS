import { test } from "node:test";
import assert from "node:assert/strict";
import { runConcierge, type ConciergeCandidate } from "../services/concierge";

delete process.env.ANTHROPIC_API_KEY;

const posts: ConciergeCandidate[] = [
  { id: "castle", caption: "国宝 松本城", category: "culture", travelerTags: ["familyFriendly"], locationName: "松本城", municipalityName: "松本市", prefecture: "長野県" },
  { id: "soba", caption: "信州そばのランチ", category: "restaurant", travelerTags: ["couples"], locationName: "五千尺キッチン", municipalityName: "松本市", prefecture: "長野県" },
  { id: "bridge", caption: "穂高連峰", category: "nature", travelerTags: ["familyFriendly", "couples"], locationName: "上高地 河童橋", municipalityName: "松本市", prefecture: "長野県" },
];

test("without an API key it answers in keyword mode, never as AI", async () => {
  const result = await runConcierge("カップルでそばランチ", "ja", posts);
  assert.equal(result.mode, "keyword");
  assert.equal(result.reply, null);
  assert.equal(result.picks[0].id, "soba");
  assert.deepEqual(result.picks[0].matched, { category: true, tags: ["couples"], text: false });
});

test("a place named inside a sentence counts as a match", async () => {
  const result = await runConcierge("上高地でのんびりしたい", "ja", posts);
  assert.deepEqual(
    result.picks.map((p) => p.id),
    ["bridge"]
  );
});

test("nothing matching means no picks", async () => {
  const result = await runConcierge("宇宙旅行", "ja", posts);
  assert.deepEqual(result.picks, []);
});
