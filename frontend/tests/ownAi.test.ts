// 自分のAIで続ける: the text handed to ChatGPT / Claude.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PROMPT_CHARS, clampPrompt, conversationPrompt, ownAiUrl, tripPrompt } from "../src/lib/ownAi.ts";
import { sentences } from "../src/lib/speak.ts";

const labels = {
  intro: "旅の相談です。",
  ask: "改善点を教えて。",
  date: (d: string) => `日付: ${d}`,
  origin: (o: string) => `出発: ${o}`,
  start: (t: string) => `出発時刻: ${t}`,
  stops: "立ち寄り先:",
  stay: (m: number) => `滞在${m}分`,
};

test("the trip as text, with the question last", () => {
  const p = tripPrompt(
    { name: "松本の旅", date: "2026-11-20", origin: "東京駅", startTime: "09:00", stops: [{ name: "松本城", place: "松本市", arrive: "11:30", stayMinutes: 60 }, { name: "上高地", place: "", stayMinutes: 120 }] },
    labels
  );
  assert.equal(p, "旅の相談です。\n「松本の旅」\n日付: 2026-11-20\n出発: 東京駅\n出発時刻: 09:00\n立ち寄り先:\n1. 11:30 松本城 (松本市) 滞在60分\n2. 上高地 滞在120分\n改善点を教えて。");
});

test("a long trip is cut but keeps the question", () => {
  const stops = Array.from({ length: 200 }, (_, i) => ({ name: `スポット${i}`, place: "どこか市", stayMinutes: 30 }));
  const p = tripPrompt({ name: "長旅", date: null, origin: "", startTime: "", stops }, labels);
  assert.ok(p.length <= MAX_PROMPT_CHARS);
  assert.ok(p.endsWith("\n改善点を教えて。"));
  assert.ok(p.includes("…"));
});

test("the conversation keeps the latest turns", () => {
  const l = { intro: "続きです。", ask: "続きを相談させて。", me: "私", ai: "AI", picks: "おすすめ" };
  const p = conversationPrompt([{ question: "雪遊び", reply: "白馬がおすすめです", picks: ["白馬", "野沢温泉"] }], l);
  assert.equal(p, "続きです。\n\n私: 雪遊び\nAI: 白馬がおすすめです\nおすすめ: 白馬、野沢温泉\n続きを相談させて。");
  const long = conversationPrompt(Array.from({ length: 50 }, (_, i) => ({ question: `質問${i}`, reply: "あ".repeat(100), picks: [] })), l);
  assert.ok(long.length <= MAX_PROMPT_CHARS);
  assert.ok(long.includes("質問49"));
  assert.ok(!long.includes("質問0\n"));
});

test("addresses and clamping", () => {
  assert.equal(ownAiUrl("chatgpt", "a b"), "https://chatgpt.com/?q=a%20b");
  assert.equal(ownAiUrl("claude", "旅"), `https://claude.ai/new?q=${encodeURIComponent("旅")}`);
  assert.equal(clampPrompt("abc", 10), "abc");
  assert.equal(clampPrompt("x".repeat(20), 10), `${"x".repeat(9)}…`);
});

test("speaking a sentence at a time", () => {
  assert.deepEqual(sentences("こんにちは。白馬がおすすめです！ Next one? ok"), ["こんにちは。", "白馬がおすすめです！", "Next one?", "ok"]);
});
