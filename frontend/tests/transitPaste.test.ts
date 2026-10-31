// 乗換案内の結果を読み取る: route text in the shapes transit apps copy/share.
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeRoute, parseTransitText, rideDateTimes } from "../src/lib/transitPaste.ts";

const NOW = new Date("2026-10-31T12:00:00+09:00");

test("transitPaste: station blocks with a transfer → one ride each", () => {
  const text = `東京→長野
2026年11月3日(火)
08:00発→10:24着(2時間24分)
乗換 1回
運賃 8,340円
■東京
｜ JR北陸新幹線 はくたか553号(長野行)
｜ 08:00-09:05
｜ 23番線発 / 1番線着
■軽井沢
｜ しなの鉄道線(長野行)
｜ 09:20-10:24
■長野`;
  const r = parseTransitText(text, NOW)!;
  assert.equal(r.date, "2026-11-03");
  assert.equal(r.rides.length, 2);
  assert.deepEqual(r.rides[0], {
    kind: "train",
    name: "JR北陸新幹線 はくたか553号(長野行)",
    fromName: "東京",
    toName: "軽井沢",
    depart: "08:00",
    arrive: "09:05",
    departPlatform: "23番線",
    arrivePlatform: "1番線",
  });
  assert.equal(r.rides[1].fromName, "軽井沢");
  assert.equal(r.rides[1].toName, "長野");
  assert.equal(r.rides[1].depart, "09:20");
  assert.equal(r.rides[1].arrive, "10:24");
});

test("transitPaste: times on the station lines, walk legs skipped, full-width text", () => {
  const text = `長野駅　０９：００発
↓ ＪＲ篠ノ井線　特急しなの８号
松本駅　０９：５０着
松本駅　１０：００発
↓ 徒歩
松本バスターミナル　１０：０５着
松本バスターミナル　１０：１０発
↓ アルピコ交通 上高地線バス 3番のりば
上高地バスターミナル　１１：４０着`;
  const r = parseTransitText(text, NOW)!;
  assert.equal(r.date, null);
  assert.equal(r.rides.length, 3 - 1, "the walk isn't a ride");
  assert.equal(r.rides[0].name, "JR篠ノ井線 特急しなの8号");
  assert.equal(r.rides[0].depart, "09:00");
  assert.equal(r.rides[0].arrive, "09:50");
  assert.equal(r.rides[1].kind, "bus");
  assert.equal(r.rides[1].fromName, "松本バスターミナル");
  assert.equal(r.rides[1].toName, "上高地バスターミナル");
  assert.equal(r.rides[1].departPlatform, "3番のりば");
});

test("transitPaste: one line, a short date, a flight", () => {
  const r = parseTransitText("11/4 羽田空港 7:30発 → 松本空港 8:40着 FDA 3101便", NOW)!;
  assert.equal(r.rides[0].name, "FDA 3101便");
  assert.equal(r.date, "2026-11-04");
  assert.equal(r.rides.length, 1);
  assert.equal(r.rides[0].fromName, "羽田空港");
  assert.equal(r.rides[0].toName, "松本空港");
  assert.equal(r.rides[0].depart, "07:30");
  assert.equal(r.rides[0].arrive, "08:40");
  assert.equal(r.rides[0].kind, "plane");
});

test("transitPaste: nothing route-like → null; looksLikeRoute", () => {
  assert.equal(parseTransitText("松本城がきれいでした", NOW), null);
  assert.equal(looksLikeRoute("松本城がきれいでした"), false);
  assert.equal(looksLikeRoute("東京 08:00発 → 長野 10:24着"), true);
});

test("rideDateTimes: rolls over midnight", () => {
  const rides = [
    { kind: "bus" as const, name: "夜行バス", fromName: "大阪", toName: "長野", depart: "22:30", arrive: "06:10", departPlatform: "", arrivePlatform: "" },
    { kind: "train" as const, name: "", fromName: "長野", toName: "湯田中", depart: "07:00", arrive: "", departPlatform: "", arrivePlatform: "" },
  ];
  assert.deepEqual(rideDateTimes("2026-12-31", rides, 45), [
    { departAt: "2026-12-31T22:30", arriveAt: "2027-01-01T06:10" },
    { departAt: "2027-01-01T07:00", arriveAt: "2027-01-01T07:45" },
  ]);
});

test("transitPaste: a header 'A→B' with the times and line below", () => {
  const r = parseTransitText("東京→長野\n08:52発→10:24着(1時間32分)\nJR北陸新幹線 かがやき505号 金沢行\n11番線着", NOW)!;
  assert.equal(r.rides.length, 1);
  assert.equal(r.rides[0].fromName, "東京");
  assert.equal(r.rides[0].toName, "長野");
  assert.equal(r.rides[0].depart, "08:52");
  assert.equal(r.rides[0].arrive, "10:24");
  assert.equal(r.rides[0].name, "JR北陸新幹線 かがやき505号 金沢行");
  assert.equal(r.rides[0].arrivePlatform, "11番線");
});

test("transportsForLegs: by the two places, else by time; each once", async () => {
  const { transportsForLegs } = await import("../src/lib/transitPaste.ts");
  const legs = [
    { fromName: "自宅", toName: "善光寺", leaveMin: 8 * 60, arriveMin: 9 * 60 + 30 },
    { fromName: "善光寺", toName: "松本城", leaveMin: 11 * 60, arriveMin: 12 * 60 + 40 },
  ];
  const at = (hhmm: string) => new Date(`2026-11-03T${hhmm}`).toISOString();
  const transports = [
    { id: "a", fromName: "長野", toName: "松本", departAt: at("11:05") },
    { id: "b", fromName: "自宅", toName: "善光寺", departAt: at("08:10") },
    { id: "c", fromName: "東京", toName: "大阪", departAt: at("18:00") },
  ];
  const out = transportsForLegs(legs, transports, "2026-11-03");
  assert.deepEqual(out.map((l) => l.map((t) => t.id)), [["b"], ["a"]]);
});
