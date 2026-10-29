// Which illustrated clip each editorial introduction gets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { themeOf } from "../lib/municipalityListings";
import { NAGANO_MUNICIPALITIES } from "../data/naganoMunicipalities";
import fs from "node:fs";
import path from "node:path";

test("sights get the clip of their kind of place", () => {
  const theme = (name: string, description = "") => themeOf({ name, description });
  assert.equal(theme("善光寺"), "shrine");
  assert.equal(theme("阿寺渓谷"), "gorge"); // 寺 in the name, but a gorge
  assert.equal(theme("霊仙寺湖"), "lake");
  assert.equal(theme("飯山の寺町"), "posttown");
  assert.equal(theme("福島関所跡", "中山道の重要な関所の跡です。"), "posttown"); // not a mountain for 中山道's 山
  assert.equal(theme("上田城跡公園"), "castle");
  assert.equal(theme("渋温泉"), "onsen");
  assert.equal(theme("北斎館"), "museum");
  assert.equal(theme("白馬岳"), "mountain");
  assert.equal(theme("八千穂高原"), "highland");
});

test("every theme used has its clip in seed-assets", () => {
  const themes = new Set(NAGANO_MUNICIPALITIES.flatMap((m) => m.spots.map((s) => themeOf(s))));
  themes.add("town");
  for (const t of themes) assert.ok(fs.existsSync(path.resolve(__dirname, `../../seed-assets/theme-${t}.webm`)), t);
});
