import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMeta } from "../lib/pageMeta";

const html = `<title>ジャジバ</title>
<meta
  name="description"
  content="generic"
/>
<meta property="og:type" content="website" />
<meta property="og:title" content="ジャジバ" />
<meta
  property="og:description"
  content="generic"
/>
<meta property="og:url" content="https://jaziba.jp/" />`;

test("fills title, description and og tags, escaping HTML", () => {
  const out = applyMeta(html, {
    title: `松本城 "国宝" <天守>`,
    description: "A & B",
    url: "https://jaziba.jp/reels/x/access",
    type: "article",
  });
  assert.match(out, /<title>松本城 &quot;国宝&quot; &lt;天守&gt;<\/title>/);
  assert.match(out, /name="description"\s+content="A &amp; B"/);
  assert.match(out, /property="og:description"\s+content="A &amp; B"/);
  assert.match(out, /og:url" content="https:\/\/jaziba.jp\/reels\/x\/access"/);
  assert.match(out, /og:type" content="article"/);
  assert.doesNotMatch(out, /generic/);
});
