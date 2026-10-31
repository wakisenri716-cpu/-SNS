// 区間の行き方: what the chosen way means for the しおり timeline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chosenFareTotal, legMinutesWithChoices, optionMinutes } from "../src/lib/legOptions.ts";

const at = (hhmm: string) => `2026-11-05T${hhmm}:00+09:00`;
const opt = (o: Partial<{ fromId: string; toId: string; chosen: boolean; durationMin: number | null; fareYen: number | null; rides: { departAt: string; arriveAt: string }[] }>) => ({
  fromId: "a", toId: "b", chosen: false, durationMin: null, fareYen: null, rides: [], ...o,
});

test("optionMinutes: as written, else first departure to last arrival", () => {
  assert.equal(optionMinutes(opt({ durationMin: 70 })), 70);
  assert.equal(optionMinutes(opt({ rides: [{ departAt: at("09:00"), arriveAt: at("09:50") }, { departAt: at("10:00"), arriveAt: at("10:40") }] })), 100);
  assert.equal(optionMinutes(opt({})), null);
});

test("legMinutesWithChoices: the chosen way replaces the estimate; others don't", () => {
  const options = [
    opt({ fromId: "a", toId: "b", durationMin: 30 }),
    opt({ fromId: "a", toId: "b", durationMin: 95, chosen: true }),
    opt({ fromId: "origin", toId: "a", durationMin: 12, chosen: true }),
    opt({ fromId: "b", toId: "c", chosen: true }), // no time: keeps the estimate
    opt({ fromId: "c", toId: "a", durationMin: 5, chosen: true }), // not a leg now
  ];
  assert.deepEqual(legMinutesWithChoices(["a", "b", "c"], [55, 40], 20, options), { originMin: 12, legMinutes: [95, 40] });
  assert.deepEqual(legMinutesWithChoices(["a", "b", "c"], [55, 40], null, options), { originMin: null, legMinutes: [95, 40] });
});

test("chosenFareTotal: only the chosen ways on current legs", () => {
  const options = [opt({ fareYen: 2500, chosen: true }), opt({ fareYen: 9000 }), opt({ fromId: "b", toId: "c", fareYen: 1200, chosen: true }), opt({ fromId: "x", toId: "y", fareYen: 500, chosen: true })];
  assert.deepEqual(chosenFareTotal([{ fromId: "a", toId: "b" }, { fromId: "b", toId: "c" }], options), { total: 3700, count: 2 });
});
