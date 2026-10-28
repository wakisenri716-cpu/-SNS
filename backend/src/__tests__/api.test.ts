// End-to-end API tests: a fresh SQLite database (migrated and seeded), the
// real Express app on a random port, and plain HTTP requests — no mocks.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaziba-test-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;
process.env.UPLOAD_DIR = path.join(tmp, "uploads");
process.env.JWT_SECRET = "test-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;

let server: Server;
let base = "";

async function call(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function login(email: string) {
  const { status, json } = await call("POST", "/api/auth/login", { email, password: "password123" });
  assert.equal(status, 200, `login ${email}`);
  return json.token as string;
}

before(async () => {
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  execSync("npx prisma migrate deploy", { cwd: path.resolve(__dirname, "../.."), env: process.env, stdio: "ignore" });
  const { seedIfEmpty } = await import("../seed");
  await seedIfEmpty();
  const { default: app } = await import("../app");
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  const { prisma } = await import("../prisma");
  await prisma.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

let traveler = "";

test("a new traveler can register and sees the seeded feed", async () => {
  const reg = await call("POST", "/api/auth/register", { email: "t1@example.com", password: "password123", name: "テスト旅行者" });
  assert.equal(reg.status, 201);
  traveler = reg.json.token;
  const feed = await call("GET", "/api/reels", undefined, traveler);
  assert.equal(feed.status, 200);
  assert.equal(feed.json.items.length, 4);
});

test("travelers cannot post reels", async () => {
  const res = await call("POST", "/api/reels", {}, traveler);
  assert.equal(res.status, 403);
});

test("the map lists only located posts", async () => {
  const { json } = await call("GET", "/api/reels/map");
  assert.ok(json.items.length > 0);
  assert.ok(json.items.every((r: any) => r.locationLat != null && r.locationLng != null));
});

test("saving builds the しおり, and the plan endpoint proposes an order for it", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  for (const r of map.items) assert.equal((await call("POST", `/api/reels/${r.id}/save`, undefined, traveler)).status < 300, true);
  const itinerary = await call("GET", "/api/reels/itinerary", undefined, traveler);
  assert.equal(itinerary.json.stops.length, map.items.length);
  const plan = await call("POST", "/api/reels/itinerary/plan", { lang: "ja" }, traveler);
  assert.equal(plan.status, 200);
  assert.equal(plan.json.mode, "auto");
  assert.equal(plan.json.stops.length, map.items.length);
  // The place to stay comes last.
  const last = map.items.find((r: any) => r.id === plan.json.stops.at(-1).id);
  assert.equal(last.category, "lodging");
});

test("a shared しおり link is read-only, hides the origin, and stops working when unshared", async () => {
  assert.equal((await call("PUT", "/api/reels/itinerary/settings", { originLabel: "東京都杉並区1-2-3" }, traveler)).status, 204);
  const shared = await call("POST", "/api/reels/itinerary/share", undefined, traveler);
  assert.equal(shared.status, 200);
  const token = shared.json.token;
  // Sharing again keeps the same link.
  assert.equal((await call("POST", "/api/reels/itinerary/share", undefined, traveler)).json.token, token);
  assert.equal((await call("GET", "/api/reels/itinerary", undefined, traveler)).json.shareToken, token);

  const view = await call("GET", `/api/trips/${token}`);
  assert.equal(view.status, 200);
  assert.equal(view.json.ownerName, "テスト旅行者");
  assert.equal(view.json.isMine, false);
  assert.ok(view.json.stops.length > 1);
  assert.equal(view.json.legs.length, view.json.stops.length - 1);
  assert.ok(!JSON.stringify(view.json).includes("杉並"));

  const other = (await call("POST", "/api/auth/register", { email: "friend@example.com", password: "password123", name: "友だち" })).json.token;
  assert.equal((await call("POST", `/api/reels/${view.json.stops[0].id}/save`, undefined, other)).status < 300, true);
  assert.deepEqual((await call("GET", `/api/trips/${token}`, undefined, other)).json.savedIds, [view.json.stops[0].id]);
  assert.equal((await call("GET", `/api/trips/${token}`, undefined, traveler)).json.isMine, true);

  const page = await fetch(`${base}/trip/${token}`);
  if (page.headers.get("content-type")?.includes("html")) {
    assert.match(await page.text(), /<title>テスト旅行者さんの旅のしおり（\d+か所）\| ジャジバ<\/title>/);
  }

  assert.equal((await call("DELETE", "/api/reels/itinerary/share", undefined, traveler)).status, 204);
  assert.equal((await call("GET", `/api/trips/${token}`)).status, 404);
  await call("PUT", "/api/reels/itinerary/settings", { originLabel: "" }, traveler);
});

test("stamp rally: refused far away, granted on site, only once", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  const far = await call("POST", `/api/reels/${castle.id}/visit`, { lat: 35.68, lng: 139.76 }, traveler);
  assert.equal(far.status, 422);
  assert.ok(far.json.distanceMeters > 100_000);
  const here = { lat: castle.locationLat + 0.001, lng: castle.locationLng };
  const first = await call("POST", `/api/reels/${castle.id}/visit`, here, traveler);
  assert.equal(first.status, 200);
  assert.equal(first.json.alreadyVisited, false);
  assert.equal(first.json.points, 20);
  const again = await call("POST", `/api/reels/${castle.id}/visit`, here, traveler);
  assert.equal(again.json.alreadyVisited, true);
  assert.equal(again.json.points, 20);
  const stamps = await call("GET", "/api/auth/me/stamps", undefined, traveler);
  assert.equal(stamps.json.items.length, 1);
});

test("concierge answers by keyword without an API key, and says so", async () => {
  const status = await call("GET", "/api/concierge/status");
  assert.deepEqual(status.json, { ai: false });
  const res = await call("POST", "/api/concierge", { message: "家族でお城を見たい", lang: "ja" });
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "keyword");
  assert.equal(res.json.picks[0].reel.locationName, "松本城");
});

test("translation is unavailable without an API key", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const res = await call("POST", `/api/reels/${map.items[0].id}/translation`, { lang: "en" });
  assert.equal(res.status, 503);
});

test("followers are notified of a new post, the poster is not", async () => {
  const municipalityToken = await login("demo-matsumoto@example.com");
  const { json: map } = await call("GET", "/api/reels/map");
  const municipalityId = map.items[0].municipality.id;
  assert.equal((await call("POST", `/api/municipalities/${municipalityId}/follow`, undefined, traveler)).status, 204);
  const following = await call("GET", "/api/auth/me/following", undefined, traveler);
  assert.deepEqual(
    following.json.items.map((f: any) => [f.kind, f.id, f.municipalityId]),
    [["municipality", municipalityId, municipalityId]]
  );

  const form = new FormData();
  form.append("video", new Blob([fs.readFileSync(path.resolve(__dirname, "../../seed-assets/kamikochi.webm"))], { type: "video/webm" }), "clip.webm");
  form.append("caption", "テスト投稿");
  form.append("category", "nature");
  const created = await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${municipalityToken}` }, body: form });
  assert.equal(created.status, 201);

  const notices = await call("GET", "/api/notifications", undefined, traveler);
  assert.equal(notices.json.items[0].type, "newPost");
  assert.equal(notices.json.items[0].posterName, map.items[0].municipality.name);
  const own = await call("GET", "/api/notifications", undefined, municipalityToken);
  assert.ok(own.json.items.every((n: any) => n.type !== "newPost"));
});

test("shared post links get their own preview title", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  const res = await fetch(`${base}/reels/${castle.id}/access`);
  if (res.headers.get("content-type")?.includes("html")) {
    const html = await res.text();
    assert.match(html, /<title>松本城（長野県松本市）\| ジャジバ<\/title>/);
  }
});

test("events: posters add them, everyone sees upcoming ones, past ones drop off", async () => {
  const municipalityToken = await login("demo-matsumoto@example.com");
  const { todayInJapan } = await import("../routes/events");
  const today = todayInJapan();
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

  assert.equal((await call("POST", "/api/events", { title: "x", startDate: today, endDate: today }, traveler)).status, 403);
  const bad = await call("POST", "/api/events", { title: "逆順", startDate: future, endDate: today }, municipalityToken);
  assert.equal(bad.status, 400);

  const created = await call(
    "POST",
    "/api/events",
    { title: "テスト祭り", startDate: today, endDate: future, locationName: "松本城", url: "https://example.com" },
    municipalityToken
  );
  assert.equal(created.status, 201);
  const past = await call("POST", "/api/events", { title: "去年の行事", startDate: "2020-01-01", endDate: "2020-01-02" }, municipalityToken);
  assert.equal(past.status, 201);

  const list = await call("GET", "/api/events");
  assert.deepEqual(
    list.json.items.map((e: any) => e.title),
    ["テスト祭り"]
  );
  const mine = await call("GET", "/api/events/mine", undefined, municipalityToken);
  assert.equal(mine.json.items.length, 2);

  assert.equal((await call("DELETE", `/api/events/${created.json.id}`, undefined, municipalityToken)).status, 204);
  assert.equal((await call("GET", "/api/events")).json.items.length, 0);
});

test("a wrong password on password change is 403, not a logout-triggering 401", async () => {
  const res = await call("PUT", "/api/auth/password", { currentPassword: "wrong-password", newPassword: "another-pass-123" }, traveler);
  assert.equal(res.status, 403);
  const del = await call("DELETE", "/api/auth/me", { password: "wrong-password" }, traveler);
  assert.equal(del.status, 403);
});

test("comment reports: hidden after 3 reporters, still visible to author and moderator, dismissible", async () => {
  const municipalityToken = await login("demo-matsumoto@example.com");
  const { json: map } = await call("GET", "/api/reels/map");
  const reelId = map.items[0].id;
  const author = (await call("POST", "/api/auth/register", { email: "author@example.com", password: "password123", name: "書いた人" })).json.token;
  const posted = await call("POST", `/api/reels/${reelId}/comments`, { body: "スパムっぽいコメント" }, author);
  assert.equal(posted.status, 201);
  const commentId = posted.json.id;

  assert.equal((await call("POST", `/api/reels/${reelId}/comments/${commentId}/report`, { reason: "spam" }, author)).status, 400);

  const reporters: string[] = [];
  for (const n of [1, 2, 3]) {
    const tok = (await call("POST", "/api/auth/register", { email: `r${n}@example.com`, password: "password123", name: `通報者${n}` })).json.token;
    reporters.push(tok);
    assert.equal((await call("POST", `/api/reels/${reelId}/comments/${commentId}/report`, { reason: "spam" }, tok)).status, 204);
  }
  // Reporting twice still counts once.
  await call("POST", `/api/reels/${reelId}/comments/${commentId}/report`, { reason: "abuse" }, reporters[0]);

  const visibleTo = async (token?: string) =>
    (await call("GET", `/api/reels/${reelId}/comments`, undefined, token)).json.items.some((c: any) => c.id === commentId);
  assert.equal(await visibleTo(), false);
  assert.equal(await visibleTo(traveler), false);
  assert.equal(await visibleTo(author), true);
  assert.equal(await visibleTo(municipalityToken), true);

  const queue = await call("GET", "/api/reels/mine/reported-comments", undefined, municipalityToken);
  const item = queue.json.items.find((c: any) => c.id === commentId);
  assert.equal(item.reportCount, 3);
  assert.deepEqual(item.reasons, { abuse: 1, spam: 2 });

  assert.equal((await call("DELETE", `/api/reels/${reelId}/comments/${commentId}/reports`, undefined, traveler)).status, 403);
  assert.equal((await call("DELETE", `/api/reels/${reelId}/comments/${commentId}/reports`, undefined, municipalityToken)).status, 204);
  assert.equal(await visibleTo(), true);
});

test("見頃: posters set the months, and ?season=now lists only posts in season this month", async () => {
  const municipalityToken = await login("demo-matsumoto@example.com");
  const { monthInJapan } = await import("../lib/season");
  const month = monthInJapan();
  const { json: map } = await call("GET", "/api/reels/map");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  const bridge = map.items.find((r: any) => r.locationName === "上高地 河童橋");

  const set = await call("PUT", `/api/reels/${castle.id}`, { bestMonths: [month, month, 13, "x"] }, municipalityToken);
  assert.equal(set.status, 200);
  assert.deepEqual(set.json.bestMonths, [month]);
  // Every other month — e.g. "10,11,12" must not count as month 1.
  const others = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => m !== month);
  assert.equal((await call("PUT", `/api/reels/${bridge.id}`, { bestMonths: others }, municipalityToken)).status, 200);

  const inSeason = await call("GET", "/api/reels?season=now", undefined, traveler);
  const ids = inSeason.json.items.map((r: any) => r.id);
  assert.ok(ids.includes(castle.id));
  assert.ok(!ids.includes(bridge.id));
  assert.ok(inSeason.json.items.every((r: any) => r.bestMonths.includes(month)));
});
