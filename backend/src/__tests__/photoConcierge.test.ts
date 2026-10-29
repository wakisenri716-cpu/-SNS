// 写真で探す with the Claude call mocked: what is sent (image first, the
// photo instructions, the schema-limited ids) and how the answer is used.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY = "test-key-not-real";

const posts = [
  { id: "castle", caption: "国宝 松本城", category: "culture", travelerTags: [], locationName: "松本城", municipalityName: "松本市", prefecture: "長野県", bestMonths: [4] },
  { id: "bridge", caption: "穂高連峰", category: "nature", travelerTags: [], locationName: "上高地 河童橋", municipalityName: "松本市", prefecture: "長野県", bestMonths: [10] },
] as const;

test("the photo goes to Claude as a base64 image block, and only listed posts come back", async () => {
  const { getClaudeClient } = await import("../services/claude");
  const { runPhotoConcierge } = await import("../services/concierge");
  const client = getClaudeClient();
  let sent: any = null;
  const create = mock.method(client.beta.messages, "create", async (body: any) => {
    sent = body;
    return {
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ reply: "雪をかぶった山と川の写真ですね。", picks: [{ id: "bridge", reason: "山と川の景色" }, { id: "made-up", reason: "x" }] }) }],
    };
  });
  try {
    const result = await runPhotoConcierge({ mediaType: "image/jpeg", data: "AAAA" }, "ja", [...posts]);
    const content = sent.messages[0].content;
    assert.deepEqual(content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    assert.equal(content[1].type, "text");
    assert.match(content[1].text, /<photo_request>/);
    assert.deepEqual(sent.output_config.format.schema.properties.picks.items.properties.id.enum, ["castle", "bridge"]);
    assert.equal(result.mode, "ai");
    assert.deepEqual(result.picks.map((p) => p.id), ["bridge"]);
  } finally {
    create.mock.restore();
  }
});

test("without an API key the photo concierge refuses instead of guessing", async () => {
  const { runPhotoConcierge } = await import("../services/concierge");
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(runPhotoConcierge({ mediaType: "image/jpeg", data: "AAAA" }, "ja", [...posts]));
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});
