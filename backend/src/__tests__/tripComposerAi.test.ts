// AIで旅をつくる with the Claude call mocked: what is sent and how the
// proposed trip is cleaned up (unknown/repeated ids, stay times, days).
import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY = "test-key-not-real";

const base = { travelerTags: [], bestMonths: [], municipalityName: "松本市", prefecture: "長野県" } as const;
const posts = [
  { ...base, id: "castle", caption: "国宝 松本城", category: "culture", locationName: "松本城", lat: 36.2381, lng: 137.9689 },
  { ...base, id: "onsen", caption: "温泉宿", category: "lodging", locationName: "浅間温泉の宿", lat: 36.25, lng: 137.99 },
  { ...base, id: "bridge", caption: "穂高連峰", category: "nature", locationName: "上高地 河童橋", lat: 36.2507, lng: 137.6376 },
];

function reply(body: unknown) {
  return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(body) }] };
}

test("Claude's trip is limited to listed posts, with tidy stay times and days split at the night's stay", async () => {
  const { getClaudeClient } = await import("../services/claude");
  const { composeTrip } = await import("../services/tripComposer");
  let sent: any = null;
  const create = mock.method(getClaudeClient().beta.messages, "create", async (body: any) => {
    sent = body;
    return reply({
      name: "松本 城と温泉 1泊2日",
      summary: "1日目は松本城、夜は温泉。2日目は上高地へ。",
      stops: [
        { id: "castle", stayMinutes: 70, reason: "国宝の城" },
        { id: "onsen", stayMinutes: 600, reason: "温泉宿" },
        { id: "made-up", stayMinutes: 60, reason: "x" },
        { id: "bridge", stayMinutes: 5, reason: "穂高連峰の景色" },
        { id: "castle", stayMinutes: 60, reason: "again" },
      ],
    });
  });
  try {
    const result = await composeTrip("1泊2日で松本、お城と温泉", "ja", [...posts]);
    assert.deepEqual(sent.output_config.format.schema.properties.stops.items.properties.id.enum, ["castle", "onsen", "bridge"]);
    assert.match(sent.messages[0].content, /2-day trip/);
    assert.match(sent.messages[0].content, /<traveler_request>\n1泊2日で松本、お城と温泉\n<\/traveler_request>/);
    assert.equal(result.mode, "ai");
    assert.equal(result.name, "松本 城と温泉 1泊2日");
    assert.deepEqual(
      result.stops.map((s) => [s.id, s.day, s.stayMinutes]),
      [
        ["castle", 1, 75],
        ["onsen", 1, 240],
        ["bridge", 2, 15],
      ]
    );
  } finally {
    create.mock.restore();
  }
});

test("if Claude fails, the keyword builder answers and says so", async () => {
  const { getClaudeClient } = await import("../services/claude");
  const { composeTrip } = await import("../services/tripComposer");
  const create = mock.method(getClaudeClient().beta.messages, "create", async () => {
    throw new Error("network down");
  });
  const quiet = mock.method(console, "error", () => {});
  try {
    const result = await composeTrip("松本城", "ja", [...posts]);
    assert.equal(result.mode, "keyword");
    assert.equal(result.stops[0].id, "castle");
  } finally {
    create.mock.restore();
    quiet.mock.restore();
  }
});
