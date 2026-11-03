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
    // The cached post list, then the photo, then the instructions that refer to it.
    const content = sent.messages[0].content;
    assert.match(content[0].text, /^<posts>/);
    assert.deepEqual(content[0].cache_control, { type: "ephemeral" });
    assert.deepEqual(content[1], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    assert.equal(content[2].type, "text");
    assert.match(content[2].text, /<photo_request>/);
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

test("地元の交通情報 a town gave goes along with its post, and only then", async () => {
  const { getClaudeClient } = await import("../services/claude");
  const { runConcierge } = await import("../services/concierge");
  let sent: any = null;
  const create = mock.method(getClaudeClient().beta.messages, "create", async (body: any) => {
    sent = body;
    return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ reply: "車がなくても行けます。", picks: [{ id: "bridge", reason: "シャトルバスがあります" }] }) }] };
  });
  try {
    await runConcierge("車なしで行ける山", "ja", [{ ...posts[0] }, { ...posts[1], localTransit: ["上高地シャトルバス: ・沢渡から30分おき"] }]);
    const list = JSON.parse(sent.messages[0].content[0].text.replace(/^<posts>\n|\n<\/posts>$/g, ""));
    assert.equal("local_transport" in list[0], false);
    assert.deepEqual(list[1].local_transport, ["上高地シャトルバス: ・沢渡から30分おき"]);
    assert.match(sent.system, /local_transport/);
  } finally {
    create.mock.restore();
  }
});
