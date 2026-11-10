// End-to-end API tests: a fresh SQLite database (migrated and seeded), the
// real Express app on a random port, and plain HTTP requests — no mocks.
import { after, before, mock, test } from "node:test";
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
process.env.DISABLE_RATE_LIMITS = "1";
// 登録の承認 is tested on its own below; elsewhere new accounts can post at once.
process.env.POSTER_APPROVAL = "off";
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
  // The demo town's own 4 posts first, then Jaziba's introductions of the towns that haven't joined.
  assert.deepEqual(
    feed.json.items.map((r: any) => r.editorial),
    [false, false, false, false, true, true, true, true, true, true]
  );
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

let firstTrip = "";

test("a quick bookmark goes to はじめての旅, and the trip's plan proposes an order", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  for (const r of map.items) {
    const saved = await call("POST", `/api/reels/${r.id}/save`, undefined, traveler);
    assert.equal(saved.status, 200);
    assert.equal(saved.json.trip.name, "はじめての旅");
    firstTrip = saved.json.trip.id;
  }
  const trips = await call("GET", "/api/me/trips", undefined, traveler);
  assert.deepEqual(trips.json.items.map((t: any) => [t.id, t.count]), [[firstTrip, map.items.length]]);
  const itinerary = await call("GET", `/api/me/trips/${firstTrip}/itinerary`, undefined, traveler);
  assert.equal(itinerary.json.stops.length, map.items.length);
  assert.equal(itinerary.json.trip.name, "はじめての旅");
  const plan = await call("POST", `/api/me/trips/${firstTrip}/plan`, { lang: "ja" }, traveler);
  assert.equal(plan.status, 200);
  assert.equal(plan.json.mode, "auto");
  assert.equal(plan.json.stops.length, map.items.length);
  // The place to stay comes last.
  const last = map.items.find((r: any) => r.id === plan.json.stops.at(-1).id);
  assert.equal(last.category, "lodging");
});

test("trips: made first, posts chosen into one or several, reordered, and bookmarks follow membership", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const [a, b] = map.items;
  assert.equal((await call("POST", "/api/me/trips", { name: "  " }, traveler)).status, 400);
  const kyoto = (await call("POST", "/api/me/trips", { name: "京都 2泊3日", startDate: "2026-11-20" }, traveler)).json;
  assert.equal(kyoto.name, "京都 2泊3日");

  // Into a chosen trip, and into a second one.
  assert.equal((await call("POST", `/api/reels/${a.id}/save`, { tripId: kyoto.id }, traveler)).json.trip.id, kyoto.id);
  assert.equal((await call("PUT", `/api/me/trips/${kyoto.id}/items/${b.id}`, undefined, traveler)).status, 204);
  const picker = await call("GET", `/api/me/trips?reel=${b.id}`, undefined, traveler);
  assert.deepEqual(
    picker.json.items.map((t: any) => [t.name, t.containsReel]),
    [["京都 2泊3日", true], ["はじめての旅", true]]
  );

  // Each trip has its own order and stay times.
  assert.equal((await call("PUT", `/api/me/trips/${kyoto.id}/order`, { reelIds: [b.id, a.id] }, traveler)).status, 204);
  assert.equal((await call("PATCH", `/api/me/trips/${kyoto.id}/items/${b.id}`, { stayMinutes: 150 }, traveler)).status, 204);
  const kyotoPlan = (await call("GET", `/api/me/trips/${kyoto.id}/itinerary`, undefined, traveler)).json;
  assert.deepEqual(kyotoPlan.stops.map((s: any) => [s.id, s.stayMinutes]), [[b.id, 150], [a.id, 60]]);
  assert.equal(kyotoPlan.trip.startDate, "2026-11-20");
  const firstPlan = (await call("GET", `/api/me/trips/${firstTrip}/itinerary`, undefined, traveler)).json;
  assert.equal(firstPlan.stops.find((s: any) => s.id === b.id).stayMinutes, 60);

  // Taken out of one trip it stays bookmarked; out of all of them it isn't.
  const savedIds = async () => (await call("GET", "/api/reels/saved", undefined, traveler)).json.items.map((r: any) => r.id);
  await call("DELETE", `/api/me/trips/${firstTrip}/items/${b.id}`, undefined, traveler);
  assert.ok((await savedIds()).includes(b.id));
  await call("DELETE", `/api/me/trips/${kyoto.id}/items/${b.id}`, undefined, traveler);
  assert.ok(!(await savedIds()).includes(b.id));

  // Someone else's trip is out of reach.
  const stranger = (await call("POST", "/api/auth/register", { email: "stranger@example.com", password: "password123", name: "他人" })).json.token;
  assert.equal((await call("GET", `/api/me/trips/${kyoto.id}/itinerary`, undefined, stranger)).status, 404);
  assert.equal((await call("PUT", `/api/me/trips/${kyoto.id}/items/${b.id}`, undefined, stranger)).status, 404);

  // Deleting a trip un-bookmarks what was only in it; un-saving clears every trip.
  await call("DELETE", `/api/me/trips/${kyoto.id}`, undefined, traveler);
  assert.ok((await savedIds()).includes(a.id)); // still in はじめての旅
  await call("PUT", `/api/me/trips/${firstTrip}/items/${b.id}`, undefined, traveler);
  assert.equal((await call("GET", `/api/me/trips`, undefined, traveler)).json.items.length, 1);
});

test("a shared しおり link is read-only, hides the origin, and stops working when unshared", async () => {
  assert.equal((await call("PATCH", `/api/me/trips/${firstTrip}`, { originLabel: "東京都杉並区1-2-3" }, traveler)).status, 204);
  const shared = await call("POST", `/api/me/trips/${firstTrip}/share`, undefined, traveler);
  assert.equal(shared.status, 200);
  const token = shared.json.token;
  // Sharing again keeps the same link.
  assert.equal((await call("POST", `/api/me/trips/${firstTrip}/share`, undefined, traveler)).json.token, token);
  assert.equal((await call("GET", `/api/me/trips/${firstTrip}/itinerary`, undefined, traveler)).json.shareToken, token);

  const view = await call("GET", `/api/trips/${token}`);
  assert.equal(view.status, 200);
  assert.equal(view.json.ownerName, "テスト旅行者");
  assert.equal(view.json.tripName, "はじめての旅");
  assert.equal(view.json.isMine, false);
  assert.ok(view.json.stops.length > 1);
  assert.equal(view.json.legs.length, view.json.stops.length - 1);
  assert.ok(!JSON.stringify(view.json).includes("杉並"));

  const other = (await call("POST", "/api/auth/register", { email: "friend@example.com", password: "password123", name: "友だち" })).json.token;
  assert.equal((await call("POST", `/api/reels/${view.json.stops[0].id}/save`, undefined, other)).status, 200);
  assert.deepEqual((await call("GET", `/api/trips/${token}`, undefined, other)).json.savedIds, [view.json.stops[0].id]);
  assert.equal((await call("GET", `/api/trips/${token}`, undefined, traveler)).json.isMine, true);

  const page = await fetch(`${base}/trip/${token}`);
  if (page.headers.get("content-type")?.includes("html")) {
    assert.match(await page.text(), /<title>テスト旅行者さんの「はじめての旅」（\d+か所）\| ジャジバ<\/title>/);
  }

  assert.equal((await call("DELETE", `/api/me/trips/${firstTrip}/share`, undefined, traveler)).status, 204);
  assert.equal((await call("GET", `/api/trips/${token}`)).status, 404);
  await call("PATCH", `/api/me/trips/${firstTrip}`, { originLabel: "" }, traveler);
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
  assert.deepEqual((await call("GET", `/api/reels/${castle.id}/visits`)).json, { today: 1, total: 1 });
});

test("concierge answers by keyword without an API key, and says so", async () => {
  const status = await call("GET", "/api/concierge/status");
  assert.deepEqual(status.json, { ai: false });
  const res = await call("POST", "/api/concierge", { message: "家族でお城を見たい", lang: "ja" });
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "keyword");
  assert.equal(res.json.picks[0].reel.locationName, "松本城");
});

test("写真で探す is unavailable without an API key", async () => {
  const res = await call("POST", "/api/concierge/photo", { image: "data:image/jpeg;base64,AAAA", lang: "ja" });
  assert.equal(res.status, 503);
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

test("comment translation: unavailable without an API key, served from cache, hidden comments stay hidden", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const reelId = map.items[0].id;
  const posted = await call("POST", `/api/reels/${reelId}/comments`, { body: "Beautiful view!" }, traveler);
  const commentId = posted.json.id;
  const url = `/api/reels/${reelId}/comments/${commentId}/translation`;

  assert.equal((await call("POST", url, { lang: "ja" })).status, 503);
  assert.equal((await call("POST", url, { lang: "xx" })).status, 400);
  assert.equal((await call("POST", `/api/reels/${reelId}/comments/nope/translation`, { lang: "ja" })).status, 404);

  const { prisma } = await import("../prisma");
  await prisma.commentTranslation.create({ data: { commentId, lang: "ja", body: "美しい眺め！" } });
  assert.deepEqual((await call("POST", url, { lang: "ja" })).json, { body: "美しい眺め！", cached: true });

  // Hidden by reports: not even its cached translation is served to others.
  const reporter = (n: number) => call("POST", "/api/auth/register", { email: `tr${n}@example.com`, password: "password123", name: `tr${n}` });
  for (const n of [1, 2, 3]) await call("POST", `/api/reels/${reelId}/comments/${commentId}/report`, { reason: "spam" }, (await reporter(n)).json.token);
  assert.equal((await call("POST", url, { lang: "ja" })).status, 404);
  assert.equal((await call("POST", url, { lang: "ja" }, traveler)).status, 200);
});

test("web push: devices subscribe, get each お知らせ in their language, and gone ones are dropped", async () => {
  const webpush = (await import("web-push")).default;
  const sent: { endpoint: string; payload: any }[] = [];
  let gone = new Set<string>();
  const send = mock.method(webpush, "sendNotification", async (sub: any, payload: string) => {
    if (gone.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201, body: "", headers: {} };
  });
  try {
    const key = await call("GET", "/api/push/public-key");
    assert.match(key.json.key, /^[A-Za-z0-9_-]{80,}$/);
    // The same key every time (it's stored, not regenerated).
    assert.equal((await call("GET", "/api/push/public-key")).json.key, key.json.key);

    const fan = (await call("POST", "/api/auth/register", { email: "fan@example.com", password: "password123", name: "ファン" })).json.token;
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    assert.equal((await call("POST", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/test-phone", keys, lang: "en" }, fan)).status, 204);
    assert.equal((await call("POST", "/api/push/subscribe", { endpoint: "https://web.push.apple.com/test-old-tablet", keys, lang: "ja" }, fan)).status, 204);
    // Only real push services: no arbitrary or internal addresses.
    for (const endpoint of ["not a url", "https://169.254.169.254/latest", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x"]) {
      assert.equal((await call("POST", "/api/push/subscribe", { endpoint, keys }, fan)).status, 400, endpoint);
    }

    const { json: map } = await call("GET", "/api/reels/map");
    const municipalityId = map.items[0].municipality.id;
    await call("POST", `/api/municipalities/${municipalityId}/follow`, undefined, fan);

    gone = new Set(["https://web.push.apple.com/test-old-tablet"]);
    const municipalityToken = await login("demo-matsumoto@example.com");
    const form = new FormData();
    form.append("video", new Blob([fs.readFileSync(path.resolve(__dirname, "../../seed-assets/kamikochi.webm"))], { type: "video/webm" }), "clip.webm");
    form.append("caption", "プッシュのテスト");
    form.append("category", "nature");
    form.append("locationName", "大正池");
    const created = await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${municipalityToken}` }, body: form });
    assert.equal(created.status, 201);
    const reelId = (await created.json()).id;

    // Sending isn't awaited by the request; give it a moment.
    for (let i = 0; i < 50 && send.mock.callCount() < 2; i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 50));
    const toPhone = sent.find((s) => s.endpoint === "https://fcm.googleapis.com/fcm/send/test-phone");
    assert.deepEqual(toPhone?.payload, {
      title: `New post from ${map.items[0].municipality.name}`,
      body: "大正池",
      url: `/reels/${reelId}/access`,
      tag: `newPost-${reelId}`,
    });
    const { prisma } = await import("../prisma");
    assert.deepEqual(
      (await prisma.pushSubscription.findMany({ where: { endpoint: { contains: "/test-" } } })).map((s) => s.endpoint),
      ["https://fcm.googleapis.com/fcm/send/test-phone"]
    );

    assert.equal((await call("DELETE", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/test-phone" }, fan)).status, 204);
    assert.equal(await prisma.pushSubscription.count({ where: { endpoint: { contains: "/test-" } } }), 0);
  } finally {
    send.mock.restore();
  }
});

test("uploads: avatars must be images and posts must be videos, with a clear 400", async () => {
  const municipalityToken = await login("demo-matsumoto@example.com");
  const clip = new Blob([fs.readFileSync(path.resolve(__dirname, "../../seed-assets/kamikochi.webm"))], { type: "video/webm" });
  const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")], { type: "image/png" });

  const videoAvatar = new FormData();
  videoAvatar.append("avatar", clip, "clip.webm");
  const bad = await fetch(`${base}/api/municipalities/me/avatar`, { method: "POST", headers: { Authorization: `Bearer ${municipalityToken}` }, body: videoAvatar });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /画像ファイル/);

  const imageAvatar = new FormData();
  imageAvatar.append("avatar", png, "a.png");
  assert.equal((await fetch(`${base}/api/auth/me/avatar`, { method: "POST", headers: { Authorization: `Bearer ${traveler}` }, body: imageAvatar })).status, 200);

  const imagePost = new FormData();
  imagePost.append("video", png, "a.png");
  imagePost.append("category", "nature");
  const badPost = await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${municipalityToken}` }, body: imagePost });
  assert.equal(badPost.status, 400);
  assert.match((await badPost.json()).error, /動画ファイル/);
});

test("live viewer count: streams the number of tabs on a spot, each tab once, and drops leavers", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const reelId = map.items[0].id;
  // Opens a stream and collects its "count" events.
  function open(client: string) {
    const controller = new AbortController();
    const counts: number[] = [];
    const done = fetch(`${base}/api/reels/${reelId}/live?client=${client}`, { signal: controller.signal })
      .then(async (res) => {
        assert.equal(res.headers.get("content-type"), "text/event-stream");
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (const m of buffer.matchAll(/event: count\ndata: (\d+)\n\n/g)) counts.push(Number(m[1]));
          buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
        }
      })
      .catch(() => {});
    return { counts, close: () => controller.abort(), done };
  }
  const settle = () => new Promise((r) => setTimeout(r, 150));

  assert.equal((await call("GET", `/api/reels/${reelId}/live`)).status, 400);
  assert.equal((await call("GET", `/api/reels/nope/live?client=abcdefgh`)).status, 404);

  const a = open("tab-aaaaaaaa");
  await settle();
  const b = open("tab-bbbbbbbb");
  await settle();
  const aAgain = open("tab-aaaaaaaa"); // the same tab reconnecting
  await settle();
  assert.deepEqual(a.counts, [1, 2, 2]);
  assert.equal((await call("GET", "/api/reels/live-counts")).json.counts[reelId], 2);
  const poster = await call("GET", "/api/reels/mine/live", undefined, await login("demo-matsumoto@example.com"));
  assert.equal(poster.json.total, 2);
  assert.equal(poster.json.items[0].id, reelId);
  assert.equal((await call("GET", "/api/reels/mine/live", undefined, traveler)).status, 403);
  assert.equal(b.counts.at(-1), 2);

  b.close();
  await settle();
  assert.equal(a.counts.at(-1), 1);
  a.close();
  aAgain.close();
  await settle();
  const { viewerCount } = await import("../lib/presence");
  assert.equal(viewerCount(reelId), 0);
});

test("new-post stream: open feeds hear about a post as soon as it's published", async () => {
  const controller = new AbortController();
  const ids: string[] = [];
  const res = await fetch(`${base}/api/reels/feed/live`, { signal: controller.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reading = (async () => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const m of buffer.matchAll(/event: post\ndata: (\{.*\})\n\n/g)) ids.push(JSON.parse(m[1]).id);
        buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
      }
    } catch {
      // aborted
    }
  })();

  const municipalityToken = await login("demo-matsumoto@example.com");
  const form = new FormData();
  form.append("video", new Blob([fs.readFileSync(path.resolve(__dirname, "../../seed-assets/kamikochi.webm"))], { type: "video/webm" }), "clip.webm");
  form.append("category", "nature");
  const created = await (await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${municipalityToken}` }, body: form })).json();
  for (let i = 0; i < 20 && ids.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(ids, [created.id]);
  controller.abort();
  await reading;
});

test("live reactions reach everyone watching the reel, tagged with the sender", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const reelId = map.items[0].id;
  const controller = new AbortController();
  const got: any[] = [];
  const res = await fetch(`${base}/api/reels/${reelId}/live?client=watcher-1`, { signal: controller.signal });
  const reading = (async () => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const m of buffer.matchAll(/event: reaction\ndata: (\{.*\})\n\n/g)) got.push(JSON.parse(m[1]));
        buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
      }
    } catch {
      // aborted
    }
  })();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await call("POST", `/api/reels/${reelId}/react`, { reaction: "fire", client: "sender-22" })).status, 204);
  assert.equal((await call("POST", `/api/reels/${reelId}/react`, { reaction: "poop", client: "sender-22" })).status, 400);
  for (let i = 0; i < 20 && got.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(got, [{ reaction: "fire", from: "sender-22" }]);
  controller.abort();
  await reading;
});

test("AIで旅をつくる: proposed by keyword without an API key, then created filled in one go", async () => {
  const proposal = await call("POST", "/api/me/trips/compose", { message: "1泊2日で松本、お城と自然", lang: "ja" }, traveler);
  assert.equal(proposal.status, 200);
  assert.equal(proposal.json.mode, "keyword");
  assert.ok(proposal.json.stops.length > 0);
  assert.ok(proposal.json.stops.every((s: any) => s.reel.id === s.id && s.day >= 1));
  assert.equal((await call("POST", "/api/me/trips/compose", { message: "" }, traveler)).status, 400);

  const items = [...proposal.json.stops.map((s: any) => ({ reelId: s.id, stayMinutes: s.stayMinutes })), { reelId: "no-such-post" }];
  const created = await call("POST", "/api/me/trips", { name: proposal.json.name, items }, traveler);
  assert.equal(created.status, 201);
  assert.equal(created.json.count, proposal.json.stops.length);
  const itinerary = (await call("GET", `/api/me/trips/${created.json.id}/itinerary`, undefined, traveler)).json;
  assert.deepEqual(
    itinerary.stops.map((s: any) => [s.id, s.stayMinutes]),
    proposal.json.stops.map((s: any) => [s.id, s.stayMinutes])
  );
  // Its posts now count as bookmarked.
  const saved = (await call("GET", "/api/reels/saved", undefined, traveler)).json;
  assert.ok(proposal.json.stops.every((s: any) => saved.items.some((r: any) => r.id === s.id)));
  await call("DELETE", `/api/me/trips/${created.json.id}`, undefined, traveler);
});

test("天気: forecasts for the しおり's days, and indoor posts near a wet day's stop", async () => {
  const real = globalThis.fetch;
  const fetchMock = mock.method(globalThis, "fetch", async (input: any, init?: any) => {
    if (!String(input).includes("open-meteo.com")) return real(input, init);
    return new Response(
      JSON.stringify({ daily: { time: ["2026-11-04"], weather_code: [63], temperature_2m_max: [12], temperature_2m_min: [8], precipitation_probability_max: [90] } })
    );
  });
  try {
    const { json: map } = await call("GET", "/api/reels/map");
    const castle = map.items.find((r: any) => r.locationName === "松本城");
    const forecast = await call("POST", "/api/weather", {
      points: [
        { lat: castle.locationLat, lng: castle.locationLng, date: "2026-11-04" },
        { lat: castle.locationLat, lng: castle.locationLng, date: "2027-01-01" },
      ],
    });
    assert.equal(forecast.status, 200);
    assert.equal(forecast.json.source, "Open-Meteo");
    assert.equal(forecast.json.days[0].kind, "rain");
    assert.equal(forecast.json.days[1], null);
    assert.equal((await call("POST", "/api/weather", { points: [] })).status, 400);

    // Near 河童橋 the restaurant is suggested; the bridge itself (outdoors, and excluded) is not.
    const bridge = map.items.find((r: any) => r.locationName === "上高地 河童橋");
    const indoor = await call("GET", `/api/weather/indoor?lat=${bridge.locationLat}&lng=${bridge.locationLng}&exclude=${bridge.id}`);
    assert.equal(indoor.status, 200);
    assert.deepEqual(
      indoor.json.items.map((i: any) => [i.reel.locationName, i.why.restaurant]),
      [["五千尺キッチン", true]]
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test("旅の振り返り: the year's saves, stamps, prefectures and busiest month, from the traveler's own activity", async () => {
  const me = (await call("POST", "/api/auth/register", { email: "recap@example.com", password: "password123", name: "振り返り" })).json.token;
  const { json: map } = await call("GET", "/api/reels/map");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  const bridge = map.items.find((r: any) => r.locationName === "上高地 河童橋");
  await call("POST", `/api/reels/${castle.id}/save`, {}, me);
  await call("POST", `/api/reels/${bridge.id}/save`, {}, me);
  await call("POST", `/api/reels/${castle.id}/like`, undefined, me);
  await call("POST", `/api/reels/${castle.id}/visit`, { lat: castle.locationLat, lng: castle.locationLng }, me);
  await call("POST", `/api/reels/${castle.id}/comments`, { body: "また行きたい" }, me);

  const year = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  const recap = await call("GET", "/api/me/recap", undefined, me);
  assert.equal(recap.status, 200);
  assert.equal(recap.json.year, year);
  assert.equal(recap.json.saved.count, 2);
  assert.deepEqual(recap.json.saved.prefectures, ["長野県"]);
  assert.equal(recap.json.saved.first.id, castle.id);
  assert.equal(recap.json.stamps.count, 1);
  assert.equal(recap.json.stamps.places[0].name, "松本城");
  assert.equal(recap.json.likes, 1);
  assert.equal(recap.json.comments, 1);
  assert.equal(recap.json.trips.count, 1);
  assert.equal(recap.json.topMunicipality.name, "松本市");
  assert.equal(recap.json.months.reduce((a: number, b: number) => a + b, 0), 4);
  assert.equal(recap.json.busiestMonth, new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1);
  // Another year is empty, not made up.
  const empty = (await call("GET", `/api/me/recap?year=${year - 3}`, undefined, me)).json;
  assert.equal(empty.saved.count, 0);
  assert.equal(empty.busiestMonth, null);
  assert.equal(empty.topCategory, null);
  assert.equal((await call("GET", "/api/me/recap")).status, 401);
});

test("長野県の全市町村: listing pages from public data, no one can sign in to them, and the demo 松本市 isn't duplicated", async () => {
  const list = (await call("GET", "/api/municipalities")).json;
  const nagano = list.filter((m: any) => m.prefecture === "長野県");
  assert.equal(nagano.length, 77);
  assert.equal(nagano.filter((m: any) => m.name === "松本市").length, 1);
  const matsumoto = nagano.find((m: any) => m.name === "松本市");
  assert.equal(matsumoto.listing, false);
  assert.equal(matsumoto.kana, "まつもとし");
  // Joined ones are listed first.
  assert.equal(list[0].listing, false);

  const nagano_city = nagano.find((m: any) => m.name === "長野市");
  assert.equal(nagano_city.listing, true);
  assert.equal(nagano_city.officeName, "長野市役所");
  const detail = (await call("GET", `/api/municipalities/${nagano_city.id}`)).json;
  assert.ok(detail.tourismSpots.some((s: any) => s.name === "善光寺"));
  // Its posts are Jaziba's introductions, one per sight, never the town's own.
  assert.equal(detail.reels.length, detail.tourismSpots.length);
  assert.ok(detail.reels.every((r: any) => r.editorial === true));
  assert.ok(detail.reels.some((r: any) => r.locationName === "善光寺" && r.category === "culture" && r.videoUrl === "/uploads/seed-theme-shrine.webm"));
  // The demo 松本市 (joined) gets none.
  const demo = (await call("GET", `/api/municipalities/${matsumoto.id}`)).json;
  assert.ok(demo.reels.every((r: any) => r.editorial === false));
  // Directions work from the office when no station is set.
  const plan = await call("GET", `/api/municipalities/${nagano_city.id}/access-plan?origin=${encodeURIComponent("東京駅")}`);
  assert.equal(plan.status, 200);
  assert.equal(plan.json.destinationLabel, "長野市役所");
  // The typed origin is found without a Maps key, and the answer says as what.
  assert.deepEqual(plan.json.originFound, { label: "東京駅（東京都）", kind: "station" });
  const sakae = nagano.find((m: any) => m.name === "栄村");
  assert.equal(sakae.officeName, "栄村役場");

  // The listing account can't be signed in to.
  const login = await call("POST", "/api/auth/login", { email: "listing-202011@listing.jaziba.invalid", password: "password123" });
  assert.equal(login.status, 401);
  // Searching by reading finds it.
  const found = (await call("GET", `/api/search?q=${encodeURIComponent("ながのし")}`)).json.municipalities;
  assert.ok(found.some((m: any) => m.name === "長野市"));

  // Running the sync again adds nothing.
  const mapBefore = (await call("GET", "/api/reels/map")).json.items.length;
  const { syncMunicipalityListings } = await import("../lib/municipalityListings");
  await syncMunicipalityListings();
  assert.equal((await call("GET", "/api/municipalities")).json.length, list.length);
  assert.equal((await call("GET", "/api/reels/map")).json.items.length, mapBefore);
});

test("乗る便: members add flights and trains to the しおり; a shared link hides seats and booking numbers", async () => {
  const me = (await call("POST", "/api/auth/register", { email: "transport@example.com", password: "password123", name: "移動派" })).json.token;
  const trip = (await call("POST", "/api/me/trips", { name: "長野へ" }, me)).json;
  const flight = {
    kind: "plane",
    name: "JL123",
    operator: "日本航空",
    fromName: "羽田空港",
    toName: "松本空港",
    departAt: "2026-11-03T08:00:00+09:00",
    arriveAt: "2026-11-03T09:00:00+09:00",
    departPlatform: "第1ターミナル 8番ゲート",
    seat: "23A",
    confirmation: "ABC123",
  };
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/transports`, { ...flight, arriveAt: "2026-11-03T07:00:00+09:00" }, me)).status, 400);
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/transports`, { ...flight, name: "" }, me)).status, 400);
  const other = (await call("POST", "/api/auth/register", { email: "transport-other@example.com", password: "password123", name: "他人" })).json.token;
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/transports`, flight, other)).status, 404);

  const created = await call("POST", `/api/me/trips/${trip.id}/transports`, flight, me);
  assert.equal(created.status, 201);
  const train = { kind: "train", name: "あずさ5号", fromName: "新宿", toName: "松本", departAt: "2026-11-03T07:30:00+09:00", arriveAt: "2026-11-03T10:10:00+09:00", seat: "5号車 7D" };
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/transports`, train, me)).status, 201);

  // In the しおり, in departure order, with everything for the members.
  const itinerary = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, me)).json;
  assert.deepEqual(itinerary.transports.map((t: any) => [t.name, t.seat]), [["あずさ5号", "5号車 7D"], ["JL123", "23A"]]);
  assert.equal(itinerary.transports[1].confirmation, "ABC123");
  assert.equal(new Date(itinerary.transports[1].departAt).toISOString(), "2026-11-02T23:00:00.000Z");

  // Edit, then the read-only shared link: times and places, no seat or booking number.
  assert.equal((await call("PUT", `/api/me/trips/${trip.id}/transports/${created.json.id}`, { ...flight, departPlatform: "第1ターミナル 10番ゲート" }, me)).status, 204);
  const token = (await call("POST", `/api/me/trips/${trip.id}/share`, undefined, me)).json.token;
  const shared = (await call("GET", `/api/trips/${token}`)).json;
  const sharedFlight = shared.transports.find((t: any) => t.name === "JL123");
  assert.equal(sharedFlight.departPlatform, "第1ターミナル 10番ゲート");
  assert.equal(sharedFlight.seat, "");
  assert.equal(sharedFlight.confirmation, "");

  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/transports/${created.json.id}`, undefined, me)).status, 204);
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/transports/${created.json.id}`, undefined, me)).status, 404);
  assert.equal((await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, me)).json.transports.length, 1);

  // A route with a transfer, saved in one go — all or nothing.
  const leg1 = { kind: "train", name: "はくたか553号", fromName: "東京", toName: "軽井沢", departAt: "2026-11-04T08:00:00+09:00", arriveAt: "2026-11-04T09:05:00+09:00" };
  const leg2 = { kind: "train", name: "しなの鉄道線", fromName: "軽井沢", toName: "長野", departAt: "2026-11-04T09:20:00+09:00", arriveAt: "2026-11-04T10:24:00+09:00" };
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/transports/batch`, { items: [leg1, { ...leg2, toName: "" }] }, me)).status, 400);
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/transports/batch`, { items: [leg1] }, other)).status, 404);
  const batch = await call("POST", `/api/me/trips/${trip.id}/transports/batch`, { items: [leg1, leg2] }, me);
  assert.equal(batch.status, 201);
  assert.equal(batch.json.items.length, 2);
  assert.deepEqual((await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, me)).json.transports.map((t: any) => t.toName), ["松本", "軽井沢", "長野"]);
});

test("現地スタンプのタグ: the post's manager makes a tag link; opening it gives the stamp without GPS", async () => {
  const muni = await login("demo-matsumoto@example.com");
  const [spot] = (await call("GET", "/api/reels/mine", undefined, muni)).json.items;
  const me = (await call("POST", "/api/auth/register", { email: "tagstamp@example.com", password: "password123", name: "タグ派" })).json.token;

  // Only the post's manager.
  assert.equal((await call("POST", `/api/reels/${spot.id}/checkin-tag`, undefined, me)).status, 403);
  assert.equal((await call("GET", `/api/reels/${spot.id}/checkin-tag`, undefined, muni)).json.token, null);
  const { token } = (await call("POST", `/api/reels/${spot.id}/checkin-tag`, undefined, muni)).json;
  assert.match(token, /^[A-Za-z0-9_-]{24}$/);
  const publicPost = (await call("GET", `/api/reels/${spot.id}`)).json;
  assert.equal(publicPost.checkinToken, undefined, "never in the public post");
  assert.equal(publicPost.hasCheckinTag, true);

  // Anyone can see which spot it's for; travelers get the stamp, once.
  const info = await call("GET", `/api/checkin/${token}`);
  assert.equal(info.json.spot.id, spot.id);
  assert.equal(info.json.visitedAt, null);
  assert.equal((await call("POST", `/api/checkin/${token}`)).status, 401);
  assert.equal((await call("POST", `/api/checkin/${token}`, undefined, muni)).status, 403);
  const first = await call("POST", `/api/checkin/${token}`, undefined, me);
  assert.equal(first.status, 200);
  assert.equal(first.json.alreadyVisited, false);
  assert.equal((await call("POST", `/api/checkin/${token}`, undefined, me)).json.alreadyVisited, true);
  const stamps = (await call("GET", "/api/auth/me/stamps", undefined, me)).json.items;
  assert.deepEqual(stamps.map((x: any) => [x.reel.id, x.method]), [[spot.id, "tag"]]);

  // Made again: the old tag stops working. Removed: none works.
  const { token: next } = (await call("POST", `/api/reels/${spot.id}/checkin-tag`, undefined, muni)).json;
  assert.notEqual(next, token);
  assert.equal((await call("GET", `/api/checkin/${token}`)).status, 404);
  assert.equal((await call("DELETE", `/api/reels/${spot.id}/checkin-tag`, undefined, muni)).status, 204);
  assert.equal((await call("GET", `/api/checkin/${next}`)).status, 404);
  assert.equal((await call("GET", `/api/reels/${spot.id}`)).json.hasCheckinTag, false);
  assert.equal((await call("GET", "/api/checkin/short")).status, 404);
});

test("素材の提供: travelers offer photos/videos; the municipality approves (points) or passes, then posts with credit", async () => {
  const muni = await login("demo-matsumoto@example.com");
  const me = (await call("GET", "/api/auth/me", undefined, muni)).json;
  const municipalityId = me.municipality.id;
  const giver = (await call("POST", "/api/auth/register", { email: "giver@example.com", password: "password123", name: "撮影好き" })).json.token;
  const upload = (token: string, fields: Record<string, string>, file?: { bytes: Buffer; type: string; name: string }) => {
    const form = new FormData();
    if (file) form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return fetch(`${base}/api/submissions`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  };
  const video = { bytes: fs.readFileSync(path.resolve(__dirname, "../../seed-assets/kamikochi.webm")), type: "video/webm", name: "clip.webm" };
  const photo = { bytes: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64"), type: "image/jpeg", name: "p.jpg" };

  // Consent is required; only travelers; a real municipality.
  assert.equal((await upload(giver, { municipalityId, description: "河童橋の朝" }, video)).status, 400);
  assert.equal((await upload(muni, { municipalityId, consent: "1" }, video)).status, 403);
  assert.equal((await upload(giver, { municipalityId: "nope", consent: "1" }, video)).status, 404);
  const v = await (await upload(giver, { municipalityId, consent: "1", description: "河童橋の朝", locationName: "河童橋", locationLat: "36.2497", locationLng: "137.6377" }, video)).json();
  assert.equal(v.kind, "video");
  assert.equal(v.status, "pending");
  const p = await (await upload(giver, { municipalityId, consent: "1", credit: "0", description: "城と桜" }, photo)).json();
  assert.equal(p.kind, "photo");
  const extra = await (await upload(giver, { municipalityId, consent: "1" }, photo)).json();

  // Withdraw while pending.
  assert.equal((await call("DELETE", `/api/submissions/${extra.id}`, undefined, giver)).status, 204);

  // The municipality's inbox: who sent it, never their email.
  const inbox = (await call("GET", "/api/submissions/inbox", undefined, muni)).json;
  assert.deepEqual(inbox.items.map((x: any) => x.id), [v.id, p.id]);
  assert.equal(inbox.items[0].contributor.name, "撮影好き");
  assert.equal(JSON.stringify(inbox).includes("giver@example.com"), false);
  assert.equal(inbox.counts.pending, 2);
  assert.equal((await call("GET", "/api/submissions/inbox", undefined, giver)).status, 403);

  // Approve the video (+100), pass on the photo with a note; each only once.
  const before = (await call("GET", "/api/auth/me/points", undefined, giver)).json.points;
  assert.equal((await call("POST", `/api/submissions/${v.id}/approve`, undefined, muni)).status, 200);
  assert.equal((await call("POST", `/api/submissions/${v.id}/approve`, undefined, muni)).status, 404);
  assert.equal((await call("POST", `/api/submissions/${p.id}/reject`, { note: "人の顔が写っているため" }, muni)).status, 200);
  const points = (await call("GET", "/api/auth/me/points", undefined, giver)).json;
  assert.equal(points.points - before, 100);
  assert.equal(points.submissionCount, 1);
  const mine = (await call("GET", "/api/submissions/mine", undefined, giver)).json.items;
  assert.deepEqual(mine.map((x: any) => [x.status, x.reviewNote, x.points]), [["rejected", "人の顔が写っているため", 0], ["approved", "", 100]]);
  assert.equal((await call("DELETE", `/api/submissions/${v.id}`, undefined, giver)).status, 400);

  // Post the approved video without uploading it again; the contributor is credited and told.
  const form = new FormData();
  form.append("submissionId", v.id);
  form.append("caption", "朝の河童橋（提供：撮影好きさん）");
  form.append("category", "nature");
  form.append("locationName", "河童橋");
  const posted = await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${muni}` }, body: form });
  assert.equal(posted.status, 201);
  const reel = await posted.json();
  assert.equal(reel.videoUrl, v.fileUrl);
  assert.equal(reel.contributedBy, "撮影好き");
  const again = new FormData();
  again.append("submissionId", v.id);
  again.append("category", "nature");
  assert.equal((await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${muni}` }, body: again })).status, 404);
  // A rejected photo can't be posted.
  const rejected = new FormData();
  rejected.append("submissionId", p.id);
  rejected.append("category", "nature");
  assert.equal((await fetch(`${base}/api/reels`, { method: "POST", headers: { Authorization: `Bearer ${muni}` }, body: rejected })).status, 404);
  const notices = (await call("GET", "/api/notifications", undefined, giver)).json.items;
  assert.equal(notices.some((n: any) => n.type === "submissionPosted" && n.reel.id === reel.id), true);
  assert.equal((await call("GET", "/api/submissions/inbox?status=posted", undefined, muni)).json.items[0].reelId, reel.id);
  await call("DELETE", `/api/reels/${reel.id}`, undefined, muni);
});

test("ポイントで交換: coupons from a municipality, exchanged for points, shown and used once; AIチケット", async () => {
  const muni = await login("demo-matsumoto@example.com");
  const municipalityId = (await call("GET", "/api/auth/me", undefined, muni)).json.municipality.id;
  const me = (await call("POST", "/api/auth/register", { email: "spender@example.com", password: "password123", name: "使う人" })).json.token;
  // Earn 200 points: two approved photos.
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  for (let i = 0; i < 2; i++) {
    const form = new FormData();
    form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "p.jpg");
    form.append("municipalityId", municipalityId);
    form.append("consent", "1");
    const sub = await (await fetch(`${base}/api/submissions`, { method: "POST", headers: { Authorization: `Bearer ${me}` }, body: form })).json();
    await call("POST", `/api/submissions/${sub.id}/approve`, undefined, muni);
  }
  assert.equal((await call("GET", "/api/points", undefined, me)).json.points, 200);

  // The municipality issues coupons; travelers can't.
  const coupon = { title: "そば大盛り無料", description: "松本駅前の店で", terms: "1会計1枚", pointsCost: 80, stock: 2, perUserLimit: 1 };
  assert.equal((await call("POST", "/api/coupons", coupon, me)).status, 403);
  assert.equal((await call("POST", "/api/coupons", { ...coupon, pointsCost: 5 }, muni)).status, 400);
  const c = (await call("POST", "/api/coupons", coupon, muni)).json;
  const pricey = (await call("POST", "/api/coupons", { ...coupon, title: "宿泊10%オフ", pointsCost: 500, stock: null }, muni)).json;
  const listed = (await call("GET", `/api/coupons?municipalityId=${municipalityId}`, undefined, me)).json.items;
  assert.deepEqual(listed.map((x: any) => [x.title, x.remaining, x.issuer.name]), [["そば大盛り無料", 2, "松本市"], ["宿泊10%オフ", null, "松本市"]]);

  // Exchange: points go down; once per person; not without enough points.
  const got = await call("POST", `/api/coupons/${c.id}/redeem`, undefined, me);
  assert.equal(got.status, 201);
  assert.match(got.json.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(got.json.points, 120);
  assert.equal((await call("POST", `/api/coupons/${c.id}/redeem`, undefined, me)).json.error, "このクーポンはお一人1枚までです");
  assert.equal((await call("POST", `/api/coupons/${pricey.id}/redeem`, undefined, me)).json.code, "notEnoughPoints");
  assert.equal((await call("GET", "/api/points", undefined, me)).json.points, 120, "failed exchanges cost nothing");

  // At the counter: the shop looks the code up (any spacing/case) and marks it used, once.
  const looked = await call("GET", `/api/coupons/verify/${got.json.code.replace("-", " ").toLowerCase()}`, undefined, muni);
  assert.equal(looked.status, 200);
  assert.equal(looked.json.holder, "使う人");
  assert.equal(looked.json.usedAt, null);
  assert.equal((await call("POST", `/api/coupons/verify/${got.json.code}/use`, undefined, muni)).status, 200);
  assert.equal((await call("POST", `/api/coupons/verify/${got.json.code}/use`, undefined, muni)).status, 400);
  const mine = (await call("GET", "/api/coupons/mine", undefined, me)).json.items;
  assert.equal(mine[0].code, got.json.code);
  assert.ok(mine[0].usedAt);
  assert.equal((await call("POST", `/api/coupons/redemptions/${mine[0].id}/use`, undefined, me)).status, 400);
  const issued = (await call("GET", "/api/coupons/issued", undefined, muni)).json.items.find((x: any) => x.id === c.id);
  assert.deepEqual([issued.exchanged, issued.used, issued.remaining], [1, 1, 1]);

  // Stopped coupons disappear from the list.
  assert.equal((await call("PATCH", `/api/coupons/${pricey.id}`, { active: false }, muni)).status, 204);
  assert.equal((await call("GET", `/api/coupons?municipalityId=${municipalityId}`)).json.items.some((x: any) => x.id === pricey.id), false);

  // AIチケット: 10 uses for 50 points.
  const bought = await call("POST", "/api/points/ai-tickets", { pack: "small" }, me);
  assert.equal(bought.status, 201);
  assert.equal(bought.json.points, 70);
  assert.equal(bought.json.ai.credits, 10);
  assert.deepEqual([bought.json.ai.freeLeft, bought.json.ai.freeLeftThisMonth, bought.json.ai.units.tripCompose], [10, 30, 5]);
  assert.equal((await call("POST", "/api/points/ai-tickets", { pack: "large" }, me)).json.code, "notEnoughPoints");

  const { checkAiQuota, recordAiUse } = await import("../lib/aiQuota");
  const { prisma } = await import("../prisma");
  process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const meId = (await call("GET", "/api/auth/me", undefined, me)).json.user.id;
    const req = { auth: { userId: meId, role: "USER" }, ip: "1.2.3.4" } as any;
    let status = 0;
    const res = { status: (s: number) => ((status = s), { json: () => {} }) } as any;
    const usage = { model: "claude-sonnet-5-5", inputTokens: 1000, cacheReadTokens: 12000, cacheWriteTokens: 0, outputTokens: 800 };
    // Free first (at most 10 a day), then tickets.
    for (let i = 0; i < 10; i++) {
      assert.equal(await checkAiQuota(req, res, "concierge"), "ai", `free use ${i + 1}`);
      await recordAiUse(req, "concierge", usage);
    }
    // A whole trip counts for 5: two from the 10 tickets.
    for (let i = 0; i < 2; i++) {
      assert.equal(await checkAiQuota(req, res, "tripCompose"), "ai");
      await recordAiUse(req, "tripCompose", usage);
    }
    assert.equal(await checkAiQuota(req, res, "concierge"), "refused");
    assert.equal(status, 402);
    const ai = (await call("GET", "/api/points", undefined, me)).json.ai;
    assert.deepEqual([ai.freeLeft, ai.freeLeftThisMonth, ai.credits], [0, 20, 0]);
    // Each use is logged with its tokens and estimated cost (Sonnet 5.5 list prices).
    const logged = await prisma.aiUsage.findFirstOrThrow({ where: { userId: meId, feature: "tripCompose" } });
    assert.deepEqual([logged.units, logged.paidUnits, logged.costMicroUsd], [5, 5, 1000 * 2 + 12000 * 0.1 + 800 * 10]);

    // 30 free uses a month: someone who used them earlier this month gets none today.
    const other = (await call("POST", "/api/auth/register", { email: "ai-month@example.com", password: "password123", name: "月末" })).json;
    const monthStart = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7)}-01T00:00:01+09:00`);
    await prisma.aiUsage.create({ data: { userId: other.user.id, feature: "concierge", units: 30, createdAt: monthStart } });
    assert.equal(await checkAiQuota({ auth: { userId: other.user.id, role: "USER" } } as any, res, "concierge"), "refused");

    // Visitors: 3 a day per address.
    const anon = { ip: "5.6.7.8" } as any;
    for (let i = 0; i < 3; i++) {
      assert.equal(await checkAiQuota(anon, res, "concierge"), "ai");
      await recordAiUse(anon, "concierge", usage);
    }
    assert.equal(await checkAiQuota(anon, res, "concierge"), "refused");

    // The app's budget: once today's estimated spend passes it, answer without AI (no refusal).
    process.env.AI_DAILY_BUDGET_USD = "0.01";
    assert.equal(await checkAiQuota({ ip: "9.9.9.9" } as any, res, "concierge"), "noAi");
    delete process.env.AI_DAILY_BUDGET_USD;
    assert.equal(await checkAiQuota({ ip: "9.9.9.9" } as any, res, "concierge"), "ai");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_DAILY_BUDGET_USD;
  }
});

test("クーポンの期限のお知らせ: one daytime push for an unused coupon ending within 3 days", async () => {
  const webpush = (await import("web-push")).default;
  const sent: { endpoint: string; payload: any }[] = [];
  const send = mock.method(webpush, "sendNotification", async (sub: any, payload: string) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201, body: "", headers: {} };
  });
  try {
    const { runCouponReminders } = await import("../lib/couponReminders");
    const { todayInJapan } = await import("../routes/events");
    const muni = await login("demo-matsumoto@example.com");
    const municipalityId = (await call("GET", "/api/auth/me", undefined, muni)).json.municipality.id;
    const me = (await call("POST", "/api/auth/register", { email: "remind@example.com", password: "password123", name: "忘れがち" })).json.token;
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    await call("POST", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/coupon-remind", keys, lang: "ja" }, me);
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64")], { type: "image/jpeg" }), "p.jpg");
    form.append("municipalityId", municipalityId);
    form.append("consent", "1");
    const sub = await (await fetch(`${base}/api/submissions`, { method: "POST", headers: { Authorization: `Bearer ${me}` }, body: form })).json();
    await call("POST", `/api/submissions/${sub.id}/approve`, undefined, muni);
    const today = todayInJapan();
    const c = (await call("POST", "/api/coupons", { title: "温泉100円引き", pointsCost: 30, validUntil: today }, muni)).json;
    await call("POST", `/api/coupons/${c.id}/redeem`, undefined, me);
    const mine = () => sent.filter((x) => x.endpoint.endsWith("coupon-remind") && x.payload.url === "/points?tab=mine");

    await runCouponReminders(new Date(`${today}T23:30:00+09:00`));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mine().length, 0, "not at night");
    await runCouponReminders(new Date(`${today}T10:00:00+09:00`));
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(mine().map((x) => [x.payload.title, x.payload.url]), [["クーポン「温泉100円引き」はもうすぐ期限です", "/points?tab=mine"]]);
    await runCouponReminders(new Date(`${today}T11:00:00+09:00`));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mine().length, 1, "only once");
  } finally {
    send.mock.restore();
  }
});

test("区間の行き方: several ways per leg, one chosen; only the chosen way's rides are the trip's 乗る便", async () => {
  const me = (await call("POST", "/api/auth/register", { email: "legways@example.com", password: "password123", name: "行き方派" })).json.token;
  const other = (await call("POST", "/api/auth/register", { email: "legways-other@example.com", password: "password123", name: "他人" })).json.token;
  const { json: map } = await call("GET", "/api/reels/map");
  const [a, b, c] = map.items;
  const trip = (await call("POST", "/api/me/trips", { name: "区間の旅", startDate: "2026-11-05" }, me)).json;
  for (const r of [a, b]) await call("PUT", `/api/me/trips/${trip.id}/items/${r.id}`, undefined, me);
  const base = `/api/me/trips/${trip.id}/leg-options`;

  // Only legs of this trip; rides need times in order.
  assert.equal((await call("POST", base, { fromId: a.id, toId: c.id, mode: "car" }, me)).status, 400);
  assert.equal((await call("POST", base, { fromId: a.id, toId: b.id, mode: "car" }, other)).status, 404);
  const badRide = { kind: "train", name: "しなの", fromName: "長野", toName: "松本", departAt: "2026-11-05T10:00:00+09:00", arriveAt: "2026-11-05T09:00:00+09:00" };
  assert.equal((await call("POST", base, { fromId: a.id, toId: b.id, mode: "train", rides: [badRide] }, me)).status, 400);

  const ride = { ...badRide, arriveAt: "2026-11-05T10:50:00+09:00", departPlatform: "3番線" };
  const train = await call("POST", base, { fromId: a.id, toId: b.id, mode: "train", title: "特急しなの", fareYen: 2500, note: "指定席", rides: [ride] }, me);
  assert.equal(train.status, 201);
  const car = await call("POST", base, { fromId: a.id, toId: b.id, mode: "car", durationMin: 70, fareYen: 1200, chosen: true }, me);
  assert.equal(car.status, 201);
  const fromOrigin = await call("POST", base, { fromId: "origin", toId: a.id, mode: "walk", durationMin: 15 }, me);
  assert.equal(fromOrigin.status, 201);

  let it = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, me)).json;
  assert.deepEqual(it.legOptions.map((o: any) => [o.mode, o.chosen]), [["train", false], ["car", true], ["walk", false]]);
  assert.equal(it.legOptions[0].rides[0].departPlatform, "3番線");
  assert.equal(it.transports.length, 0, "the train isn't chosen, so it isn't a 乗る便");

  // これで行く on the train: the car is no longer chosen, the ride is a 乗る便.
  assert.equal((await call("PUT", `${base}/${train.json.id}/chosen`, { chosen: true }, me)).status, 204);
  it = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, me)).json;
  assert.deepEqual(it.legOptions.map((o: any) => o.chosen), [true, false, false]);
  assert.deepEqual(it.transports.map((t: any) => [t.name, t.optionId]), [["しなの", train.json.id]]);

  // Edit: the kept ride keeps its id; a second ride is added.
  const rideId = it.legOptions[0].rides[0].id;
  const edited = await call("PUT", `${base}/${train.json.id}`, {
    fromId: a.id, toId: b.id, mode: "train", title: "特急しなの＋バス", fareYen: 3000,
    rides: [{ ...ride, id: rideId, seat: "3号車 5A" }, { kind: "bus", name: "アルピコ交通", fromName: "松本", toName: "松本城", departAt: "2026-11-05T11:00:00+09:00", arriveAt: "2026-11-05T11:10:00+09:00" }],
  }, me);
  assert.equal(edited.status, 200);
  assert.equal(edited.json.chosen, true, "chosen stays when not sent");
  assert.deepEqual(edited.json.rides.map((r: any) => r.id === rideId), [true, false]);

  // A shared link: the chosen way only, without notes or seats.
  const token = (await call("POST", `/api/me/trips/${trip.id}/share`, undefined, me)).json.token;
  const shared = (await call("GET", `/api/trips/${token}`)).json;
  assert.deepEqual(shared.legOptions.map((o: any) => [o.title, o.note, o.rides[0].seat]), [["特急しなの＋バス", "", ""]]);
  assert.equal(shared.transports.length, 2);

  // Taking a stop out drops the ways for its legs.
  assert.equal((await call("DELETE", `${base}/${car.json.id}`, undefined, me)).status, 204);
  await call("DELETE", `/api/me/trips/${trip.id}/items/${b.id}`, undefined, me);
  it = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, me)).json;
  assert.deepEqual(it.legOptions.map((o: any) => o.mode), ["walk"]);
  assert.equal(it.transports.length, 0);
});

test("乗る便のお知らせ: a push to everyone on the trip before departure and before arrival, each once", async () => {
  const webpush = (await import("web-push")).default;
  const sent: { endpoint: string; payload: any }[] = [];
  const send = mock.method(webpush, "sendNotification", async (sub: any, payload: string) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201, body: "", headers: {} };
  });
  try {
    const { runTransportAlerts } = await import("../lib/transportAlerts");
    const owner = (await call("POST", "/api/auth/register", { email: "alert-owner@example.com", password: "password123", name: "幹事" })).json.token;
    const friend = (await call("POST", "/api/auth/register", { email: "alert-friend@example.com", password: "password123", name: "友人" })).json.token;
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    await call("POST", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/alert-owner", keys, lang: "ja" }, owner);
    await call("POST", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/alert-friend", keys, lang: "en" }, friend);
    const trip = (await call("POST", "/api/me/trips", { name: "通知の旅" }, owner)).json;
    const invite = (await call("POST", `/api/me/trips/${trip.id}/invite`, undefined, owner)).json.token;
    await call("POST", `/api/me/trips/join/${invite}`, undefined, friend);

    const now = Date.parse("2030-05-01T08:40:00+09:00");
    const train = { kind: "train", name: "あずさ5号", fromName: "新宿", toName: "松本", departAt: "2030-05-01T09:00:00+09:00", arriveAt: "2030-05-01T11:40:00+09:00", departPlatform: "9番線" };
    const created = (await call("POST", `/api/me/trips/${trip.id}/transports`, train, owner)).json;
    const mine = () => sent.filter((s) => s.endpoint.includes("alert-"));

    // 20 minutes before: the departure push, to both, in each device's language.
    await runTransportAlerts(now);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(
      mine().map((s) => [s.endpoint.split("/").pop(), s.payload.title, s.payload.body]).sort(),
      [
        ["alert-friend", "あずさ5号 departs in about 20 min", "新宿 at 09:00 · 9番線"],
        ["alert-owner", "あずさ5号 まもなく出発（約20分後）", "新宿 09:00発・9番線"],
      ]
    );
    assert.equal(mine()[0].payload.url, `/itinerary/${trip.id}`);
    // Not again.
    await runTransportAlerts(now + 60_000);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mine().length, 2);

    // 4 minutes before arrival: the arrival push.
    await runTransportAlerts(Date.parse("2030-05-01T11:36:00+09:00"));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mine().length, 4);
    assert.ok(mine().some((s) => s.payload.title === "まもなく松本に到着（約4分）"));

    // Moving the departure later sends a fresh departure alert for the new time.
    await call("PUT", `/api/me/trips/${trip.id}/transports/${created.id}`, { ...train, departAt: "2030-05-01T10:00:00+09:00", arriveAt: "2030-05-01T12:40:00+09:00" }, owner);
    await runTransportAlerts(Date.parse("2030-05-01T09:45:00+09:00"));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mine().filter((s) => /まもなく出発/.test(s.payload.title)).length, 2);
  } finally {
    send.mock.restore();
  }
});

test("旅のアルバム: members add photos placed at the nearest stop; only the adder or owner removes one", async () => {
  const owner = (await call("POST", "/api/auth/register", { email: "album-owner@example.com", password: "password123", name: "幹事" })).json.token;
  const friend = (await call("POST", "/api/auth/register", { email: "album-friend@example.com", password: "password123", name: "友人" })).json.token;
  const outsider = (await call("POST", "/api/auth/register", { email: "album-outsider@example.com", password: "password123", name: "他人" })).json.token;
  const { json: map } = await call("GET", "/api/reels/map");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  const bridge = map.items.find((r: any) => r.locationName === "上高地 河童橋");
  const trip = (await call("POST", "/api/me/trips", { name: "写真の旅", items: [{ reelId: castle.id }, { reelId: bridge.id }] }, owner)).json;
  const invite = (await call("POST", `/api/me/trips/${trip.id}/invite`, undefined, owner)).json.token;
  await call("POST", `/api/me/trips/join/${invite}`, undefined, friend);

  async function upload(token: string, fields: Record<string, string>, type = "image/jpeg") {
    const form = new FormData();
    form.append("photo", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type }), "photo.jpg");
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch(`${base}/api/me/trips/${trip.id}/photos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  // Taken 100 m from the castle: placed there. No location: in the album, no stop.
  const nearCastle = await upload(friend, { width: "1600", height: "1200", lat: String(castle.locationLat + 0.0009), lng: String(castle.locationLng), takenAt: "2026-11-03T10:15:30+09:00" });
  assert.equal(nearCastle.status, 201);
  assert.equal(nearCastle.json.stopReelId, castle.id);
  assert.equal(nearCastle.json.by.name, "友人");
  assert.match(nearCastle.json.url, /^\/uploads\/[0-9a-f-]+\.jpg$/);
  const noPlace = await upload(owner, { width: "1200", height: "1600" });
  assert.equal(noPlace.json.stopReelId, null);
  assert.equal(noPlace.json.hasLocation, false);
  // Far from every stop: no stop.
  assert.equal((await upload(owner, { width: "10", height: "10", lat: "35.68", lng: "139.76" })).json.stopReelId, null);
  assert.equal((await upload(outsider, { width: "10", height: "10" })).status, 404);
  assert.equal((await upload(owner, { width: "10", height: "10" }, "video/webm")).status, 400);
  assert.equal((await upload(owner, {})).status, 400);

  // In the しおり, oldest-taken first, for every member.
  const asFriend = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, friend)).json;
  assert.equal(asFriend.photos.length, 3);
  assert.equal(asFriend.photos.find((p: any) => p.id === nearCastle.json.id).isMine, true);
  assert.equal(asFriend.photos.find((p: any) => p.id === noPlace.json.id).isMine, false);
  // The file is served while it's in the album, and removed with it.
  assert.equal((await fetch(`${base}${nearCastle.json.url}`)).status, 200);

  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/photos/${noPlace.json.id}`, undefined, friend)).status, 403);
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/photos/${nearCastle.json.id}`, undefined, owner)).status, 204);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await fetch(`${base}${nearCastle.json.url}`)).status, 404);
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/photos/${noPlace.json.id}`, undefined, owner)).status, 204);
});

// A software passkey authenticator: an ES256 key pair making the same
// attestation ("none") and assertions a phone or laptop would.
async function softAuthenticator(origin: string) {
  const { createHash, generateKeyPairSync, randomBytes, sign } = await import("node:crypto");
  const { isoCBOR } = await import("@simplewebauthn/server/helpers");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialId = randomBytes(16);
  const rpIdHash = createHash("sha256").update(new URL(origin).hostname).digest();
  const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
  let counter = 0;
  const clientData = (type: string, challenge: string) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const counterBytes = () => {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(++counter);
    return c;
  };
  return {
    id: b64url(credentialId),
    register(challenge: string) {
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x!, "base64url")],
          [-3, Buffer.from(jwk.y!, "base64url")],
        ])
      );
      const idLen = Buffer.alloc(2);
      idLen.writeUInt16BE(credentialId.length);
      // Flags: user present + user verified + attested credential data.
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x45]), counterBytes(), Buffer.alloc(16), idLen, credentialId, Buffer.from(cose)]);
      const attestationObject = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]) as never);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        clientExtensionResults: {},
        response: { clientDataJSON: b64url(clientData("webauthn.create", challenge)), attestationObject: b64url(attestationObject), transports: ["internal"] },
      };
    },
    assert(challenge: string) {
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x05]), counterBytes()]);
      const cd = clientData("webauthn.get", challenge);
      const signature = sign("sha256", Buffer.concat([authData, createHash("sha256").update(cd).digest()]), privateKey);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        clientExtensionResults: {},
        response: { clientDataJSON: b64url(cd), authenticatorData: b64url(authData), signature: b64url(signature), userHandle: null },
      };
    },
  };
}

test("パスキー: add one while signed in, sign in with it without email or password, and a deleted one is refused", async () => {
  const token = (await call("POST", "/api/auth/register", { email: "passkey@example.com", password: "password123", name: "パスキー派" })).json.token;
  const device = await softAuthenticator(base);

  assert.equal((await call("POST", "/api/auth/passkey/register/options")).status, 401);
  const regOptions = (await call("POST", "/api/auth/passkey/register/options", undefined, token)).json;
  assert.equal(regOptions.rp.id, new URL(base).hostname);
  assert.equal(regOptions.authenticatorSelection.residentKey, "required");
  // A response to some other challenge is rejected.
  const forged = device.register("not-the-challenge");
  assert.equal((await call("POST", "/api/auth/passkey/register/verify", { response: forged }, token)).status, 400);
  // (That used up the challenge, so ask again.)
  const fresh = (await call("POST", "/api/auth/passkey/register/options", undefined, token)).json;
  const added = await call("POST", "/api/auth/passkey/register/verify", { response: device.register(fresh.challenge) }, token);
  assert.equal(added.status, 201);
  assert.equal(added.json.id, device.id);
  assert.deepEqual((await call("GET", "/api/auth/passkey", undefined, token)).json.items.map((p: any) => p.id), [device.id]);
  // The next registration excludes it, so a device can't add a second one.
  assert.deepEqual((await call("POST", "/api/auth/passkey/register/options", undefined, token)).json.excludeCredentials.map((c: any) => c.id), [device.id]);

  // Sign in: no email, the challenge only works once, the signature must verify.
  const login = (await call("POST", "/api/auth/passkey/login/options")).json;
  const signedIn = await call("POST", "/api/auth/passkey/login/verify", { flowId: login.flowId, response: device.assert(login.options.challenge) });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.json.user.email, "passkey@example.com");
  assert.equal((await call("GET", "/api/auth/me", undefined, signedIn.json.token)).status, 200);
  assert.equal((await call("POST", "/api/auth/passkey/login/verify", { flowId: login.flowId, response: device.assert(login.options.challenge) })).status, 400);
  const again = (await call("POST", "/api/auth/passkey/login/options")).json;
  const tampered = device.assert(again.options.challenge);
  tampered.response.signature = Buffer.from("not a signature").toString("base64url");
  assert.equal((await call("POST", "/api/auth/passkey/login/verify", { flowId: again.flowId, response: tampered })).status, 401);
  assert.ok((await call("GET", "/api/auth/passkey", undefined, token)).json.items[0].lastUsedAt);

  // Someone else can't delete it; once its owner does, it no longer signs in.
  const other = (await call("POST", "/api/auth/register", { email: "passkey-other@example.com", password: "password123", name: "別の人" })).json.token;
  assert.equal((await call("DELETE", `/api/auth/passkey/${device.id}`, undefined, other)).status, 404);
  assert.equal((await call("DELETE", `/api/auth/passkey/${device.id}`, undefined, token)).status, 204);
  const last = (await call("POST", "/api/auth/passkey/login/options")).json;
  const refused = await call("POST", "/api/auth/passkey/login/verify", { flowId: last.flowId, response: device.assert(last.options.challenge) });
  assert.equal(refused.status, 401);
  assert.equal(refused.json.unknownCredential, true);
});

test("共同編集: invite, join, edit together with live updates, and leave", async () => {
  const owner = (await call("POST", "/api/auth/register", { email: "collab-owner@example.com", password: "password123", name: "幹事" })).json.token;
  const friend = (await call("POST", "/api/auth/register", { email: "collab-friend@example.com", password: "password123", name: "友人" })).json.token;
  const { json: map } = await call("GET", "/api/reels/map");
  const [a, b] = map.items;
  const trip = (await call("POST", "/api/me/trips", { name: "みんなの旅" }, owner)).json;
  await call("PUT", `/api/me/trips/${trip.id}/items/${a.id}`, undefined, owner);

  // Only the owner makes the invite link; anyone can preview it.
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/invite`, undefined, friend)).status, 404);
  const invite = (await call("POST", `/api/me/trips/${trip.id}/invite`, undefined, owner)).json.token;
  assert.deepEqual(
    (({ tripName, ownerName, count, people }) => ({ tripName, ownerName, count, people }))((await call("GET", `/api/trips/invite/${invite}`)).json),
    { tripName: "みんなの旅", ownerName: "幹事", count: 1, people: 1 }
  );

  // Live stream for the owner (one-time ticket).
  const ticket = (await call("POST", `/api/me/trips/${trip.id}/live-ticket`, undefined, owner)).json.ticket;
  const controller = new AbortController();
  const events: { event: string; data: any }[] = [];
  const stream = await fetch(`${base}/api/trips/live/${ticket}`, { signal: controller.signal });
  const reading = (async () => {
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const m of buffer.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)) events.push({ event: m[1], data: JSON.parse(m[2]) });
        buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
      }
    } catch {
      // aborted
    }
  })();
  assert.equal((await fetch(`${base}/api/trips/live/${ticket}`)).status, 404); // used up

  // The friend joins and edits; the owner hears about it.
  assert.equal((await call("POST", `/api/me/trips/join/${invite}`, undefined, friend)).json.tripId, trip.id);
  const friendList = (await call("GET", "/api/me/trips", undefined, friend)).json.items;
  assert.deepEqual(friendList.map((t: any) => [t.name, t.isOwner, t.ownerName, t.people]), [["みんなの旅", false, "幹事", 2]]);
  assert.equal((await call("PUT", `/api/me/trips/${trip.id}/items/${b.id}`, undefined, friend)).status, 204);
  assert.equal((await call("PUT", `/api/me/trips/${trip.id}/order`, { reelIds: [b.id, a.id] }, friend)).status, 204);
  for (let i = 0; i < 20 && events.filter((e) => e.event === "changed").length < 3; i++) await new Promise((r) => setTimeout(r, 25));
  const changes = events.filter((e) => e.event === "changed");
  assert.ok(changes.length >= 3);
  assert.equal(changes.at(-1)!.data.by.name, "友人");
  assert.equal(events.find((e) => e.event === "presence")!.data.people[0].name, "幹事");

  const seen = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, owner)).json;
  assert.deepEqual(seen.stops.map((s: any) => s.id), [b.id, a.id]);
  assert.deepEqual(seen.members.map((m: any) => m.name), ["友人"]);
  assert.equal(seen.inviteToken, invite);
  const asFriend = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, friend)).json;
  assert.equal(asFriend.isOwner, false);
  assert.equal(asFriend.inviteToken, null);
  // Both now have both posts bookmarked.
  for (const tok of [owner, friend]) {
    const ids = (await call("GET", "/api/reels/saved", undefined, tok)).json.items.map((r: any) => r.id);
    assert.ok(ids.includes(a.id) && ids.includes(b.id));
  }

  // みんなの現在地: the friend shares where they are; the owner's open しおり hears it.
  const stranger = (await call("POST", "/api/auth/register", { email: "collab-stranger@example.com", password: "password123", name: "部外者" })).json.token;
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/location`, { lat: 36.25, lng: 137.64 }, stranger)).status, 404);
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/location`, { lat: 999, lng: 137.64 }, friend)).status, 400);
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/location`, { lat: 36.251, lng: 137.6389, accuracy: 12 }, friend)).status, 204);
  // A second update a moment later is ignored (202), not an error.
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/location`, { lat: 36.252, lng: 137.6389 }, friend)).status, 202);
  const lastLocations = () => events.filter((e) => e.event === "locations").at(-1)?.data.people ?? [];
  for (let i = 0; i < 20 && lastLocations().length === 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(
    lastLocations().map((p: any) => [p.name, p.lat, p.lng, p.accuracy]),
    [["友人", 36.251, 137.6389, 12]]
  );
  // Switching it off removes it for everyone.
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/location`, undefined, friend)).status, 204);
  for (let i = 0; i < 20 && lastLocations().length > 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(lastLocations(), []);
  // Leaving the trip also stops it.
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/location`, { lat: 36.25, lng: 137.64 }, friend)).status, 204);
  for (let i = 0; i < 20 && lastLocations().length === 0; i++) await new Promise((r) => setTimeout(r, 25));

  // Members can't delete the trip or remove others; they can leave.
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}`, undefined, friend)).status, 404);
  const friendId = asFriend.members[0].id;
  const ownerId = asFriend.owner.id;
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/members/${ownerId}`, undefined, friend)).status, 403);
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/members/${friendId}`, undefined, friend)).status, 204);
  assert.equal((await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, friend)).status, 404);
  assert.deepEqual((await call("GET", "/api/reels/saved", undefined, friend)).json.items, []);
  for (let i = 0; i < 20 && lastLocations().length > 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(lastLocations(), []);

  // Turning the invite off stops new joins.
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/invite`, undefined, owner)).status, 204);
  assert.equal((await call("POST", `/api/me/trips/join/${invite}`, undefined, friend)).status, 404);
  controller.abort();
  await reading;
});

test("有料プラン: Stripe Checkout, the webhook turns the plan on and off, and what it unlocks", async () => {
  const { setStripeForTests, activePlan } = await import("../lib/plans");
  const { prisma } = await import("../prisma");
  const me = (await call("POST", "/api/auth/register", { email: "payer@example.com", password: "password123", name: "払う人" })).json;

  // Without Stripe set up the plans are shown but can't be bought.
  const before = (await call("GET", "/api/billing", undefined, me.token)).json;
  assert.equal(before.paymentsReady, false);
  assert.deepEqual(before.plans.map((p: any) => [p.id, p.priceYen, p.purchasable]), [["plus", 480, false], ["business", 2000, false], ["municipalityPro", null, false]]);
  assert.equal(before.current, null);
  assert.equal((await call("POST", "/api/billing/checkout", { plan: "plus" }, me.token)).json.code, "paymentsNotReady");

  const sent: Record<string, any> = {};
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  const subscription = (status: string, metadata: Record<string, string>) => ({
    id: "sub_1",
    customer: "cus_1",
    status,
    metadata,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_plus" }, current_period_end: periodEnd }] },
  });
  setStripeForTests({
    customers: { create: async (p: any) => ((sent.customer = p), { id: "cus_1" }) },
    checkout: { sessions: { create: async (p: any) => ((sent.checkout = p), { url: "https://checkout.stripe.test/s1" }) } },
    billingPortal: { sessions: { create: async (p: any) => ((sent.portal = p), { url: "https://billing.stripe.test/p1" }) } },
    // No metadata: the account is found from the Stripe customer, the plan from the price.
    subscriptions: { retrieve: async () => subscription("active", {}), cancel: async (id: string) => ((sent.cancelled = id), {}) },
    webhooks: {
      constructEvent: (body: Buffer, signature: string) => {
        if (signature !== "good") throw new Error("bad signature");
        return JSON.parse(body.toString());
      },
    },
  });
  process.env.STRIPE_PRICE_PLUS = "price_plus";
  process.env.STRIPE_PRICE_BUSINESS = "price_business";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const webhook = (event: unknown, signature = "good") =>
    fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: JSON.stringify(event) });
  try {
    assert.equal((await call("GET", "/api/billing")).json.plans[0].purchasable, true);
    // Only the plan for this kind of account.
    assert.equal((await call("POST", "/api/billing/checkout", { plan: "business" }, me.token)).status, 403);
    const checkout = await call("POST", "/api/billing/checkout", { plan: "plus" }, me.token);
    assert.deepEqual(checkout.json, { url: "https://checkout.stripe.test/s1" });
    assert.equal(sent.checkout.mode, "subscription");
    assert.equal(sent.checkout.customer, "cus_1");
    assert.deepEqual(sent.checkout.line_items, [{ price: "price_plus", quantity: 1 }]);
    assert.deepEqual(sent.checkout.subscription_data.metadata, { userId: me.user.id, plan: "plus" });
    assert.match(sent.checkout.success_url, /\/plans\?checkout=success$/);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: me.user.id } })).stripeCustomerId, "cus_1");
    // Nothing changes until Stripe confirms.
    assert.equal((await call("GET", "/api/points", undefined, me.token)).json.ai.freePerMonth, 30);

    assert.equal((await webhook({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1" } } }, "forged")).status, 400);
    assert.equal(await activePlan(me.user.id), null);
    assert.equal((await webhook({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1" } } })).status, 200);
    const now = (await call("GET", "/api/billing", undefined, me.token)).json.current;
    assert.deepEqual([now.plan, now.active, now.status, now.source], ["plus", true, "active", "stripe"]);
    assert.equal(new Date(now.currentPeriodEnd).getTime(), periodEnd * 1000);
    const ai = (await call("GET", "/api/points", undefined, me.token)).json.ai;
    assert.deepEqual([ai.plan, ai.freePerMonth, ai.freeMaxPerDay, ai.freeLeft], ["plus", 300, 50, 50]);
    assert.equal((await call("POST", "/api/billing/checkout", { plan: "plus" }, me.token)).status, 400, "already on a plan");
    const portal = await call("POST", "/api/billing/portal", undefined, me.token);
    assert.equal(portal.json.url, "https://billing.stripe.test/p1");
    assert.deepEqual([sent.portal.customer, /\/plans$/.test(sent.portal.return_url)], ["cus_1", true]);

    // A failed renewal keeps the plan for a week while Stripe retries; cancelling ends it.
    await prisma.planSubscription.update({ where: { userId: me.user.id }, data: { status: "past_due", currentPeriodEnd: days(-3) } });
    assert.equal(await activePlan(me.user.id), "plus");
    await prisma.planSubscription.update({ where: { userId: me.user.id }, data: { currentPeriodEnd: days(-8) } });
    assert.equal(await activePlan(me.user.id), null);
    assert.equal((await webhook({ type: "customer.subscription.deleted", data: { object: subscription("canceled", { userId: me.user.id, plan: "plus" }) } })).status, 200);
    assert.equal((await call("GET", "/api/billing", undefined, me.token)).json.current.active, false);
    assert.equal((await call("GET", "/api/points", undefined, me.token)).json.ai.freePerMonth, 30);

    // Deleting the account stops the card plan at Stripe first.
    const leaver = (await call("POST", "/api/auth/register", { email: "leaver@example.com", password: "password123", name: "やめる人" })).json;
    await prisma.planSubscription.create({ data: { userId: leaver.user.id, plan: "plus", status: "active", source: "stripe", stripeSubscriptionId: "sub_2", currentPeriodEnd: days(20) } });
    assert.equal((await call("DELETE", "/api/auth/me", { password: "password123" }, leaver.token)).status, 204);
    assert.equal(sent.cancelled, "sub_2");
  } finally {
    setStripeForTests(undefined);
    delete process.env.STRIPE_PRICE_PLUS;
    delete process.env.STRIPE_PRICE_BUSINESS;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }

  // Coupons: a shop can hand out 1 at a time for free, 50 with ビジネス.
  const muni = await login("demo-matsumoto@example.com");
  const municipalityId = (await call("GET", "/api/auth/me", undefined, muni)).json.municipality.id;
  const shop = (await call("POST", "/api/auth/register-company", { email: "shop@example.com", password: "password123", name: "店主", companyName: "そば処", municipalityId })).json;
  const coupon = { title: "そば100円引き", pointsCost: 50 };
  const first = (await call("POST", "/api/coupons", coupon, shop.token)).json;
  const second = await call("POST", "/api/coupons", { ...coupon, title: "天ぷら無料" }, shop.token);
  assert.deepEqual([second.status, second.json.code, second.json.limit], [400, "planLimit", 1]);
  await prisma.planSubscription.create({ data: { userId: shop.user.id, plan: "business", status: "active", source: "invoice", currentPeriodEnd: days(30) } });
  const more = (await call("POST", "/api/coupons", { ...coupon, title: "天ぷら無料" }, shop.token)).json;
  assert.ok(more.id);
  // Back on the free plan: both stay out, but a stopped one can't be restarted past the limit.
  await prisma.planSubscription.delete({ where: { userId: shop.user.id } });
  assert.equal((await call("PATCH", `/api/coupons/${more.id}`, { active: false }, shop.token)).status, 204);
  assert.equal((await call("PATCH", `/api/coupons/${more.id}`, { active: true }, shop.token)).json.code, "planLimit");
  assert.equal((await call("PATCH", `/api/coupons/${first.id}`, { active: false }, shop.token)).status, 204);
  assert.equal((await call("PATCH", `/api/coupons/${more.id}`, { active: true }, shop.token)).status, 204);
});

function days(n: number) {
  return new Date(Date.now() + n * 86400_000);
}

test("地元の交通情報: a municipality or business adds a screenshot/PDF and notes; travelers see them on the access pages", async () => {
  const muni = await login("demo-matsumoto@example.com");
  const me = (await call("GET", "/api/auth/me", undefined, muni)).json;
  const municipalityId = me.municipality.id;
  const reels = (await call("GET", `/api/municipalities/${municipalityId}`)).json.reels ?? (await call("GET", "/api/reels/mine", undefined, muni)).json.items;
  const spot = reels[0].id;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const post = (fields: Record<string, string>, file?: { data: Buffer; type: string; name: string }, token = muni) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (file) form.append("file", new Blob([file.data], { type: file.type }), file.name);
    return fetch(`${base}/api/local-transit`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  };

  // A timetable screenshot for the whole town, and notes for one spot.
  const bus = await post({ title: "コミュニティバス 市内線", body: "・1日6便\n・運賃 200円", sourceUrl: "https://www.city.example.jp/bus", aiDrafted: "true" }, { data: png, type: "image/png", name: "時刻表.png" });
  assert.equal(bus.status, 201);
  const busJson = await bus.json();
  assert.deepEqual([busJson.fileKind, busJson.fileName, busJson.aiDrafted, busJson.issuer.name, busJson.reel], ["image", "時刻表.png", true, "松本市", null]);
  assert.equal((await fetch(`${base}${busJson.fileUrl}`)).status, 200);
  const taxi = await (await post({ title: "乗合タクシー", body: "前日までに予約", reelId: spot })).json();
  // Not without content, not a video, not a bad URL, not by travelers.
  assert.equal((await post({ title: "空" })).status, 400);
  assert.equal((await post({ title: "動画" }, { data: Buffer.from("x"), type: "video/mp4", name: "a.mp4" })).status, 400);
  assert.equal((await post({ title: "URL", body: "x", sourceUrl: "javascript:alert(1)" })).status, 400);
  const traveler = (await call("POST", "/api/auth/register", { email: "transit-viewer@example.com", password: "password123", name: "見る人" })).json.token;
  assert.equal((await post({ title: "x", body: "y" }, undefined, traveler)).status, 403);
  // An expired one is hidden.
  const old = await (await post({ title: "夏季臨時バス", body: "8月のみ", validUntil: "2020-08-31" })).json();

  // The spot's page: its own first, then the town's; the town's page: all current ones.
  const forSpot = (await call("GET", `/api/local-transit?reelId=${spot}`)).json.items;
  assert.deepEqual(forSpot.map((x: any) => x.title), ["乗合タクシー", "コミュニティバス 市内線"]);
  const otherSpot = reels.find((r: any) => r.id !== spot)?.id;
  if (otherSpot) assert.deepEqual((await call("GET", `/api/local-transit?reelId=${otherSpot}`)).json.items.map((x: any) => x.title), ["コミュニティバス 市内線"]);
  assert.equal((await call("GET", `/api/local-transit?municipalityId=${municipalityId}`)).json.items.some((x: any) => x.id === old.id), false);

  // A business adds its shuttle (shown with its name); it can't attach to the town's spot.
  const shop = (await call("POST", "/api/auth/register-company", { email: "inn@example.com", password: "password123", name: "宿の人", companyName: "山の宿", municipalityId })).json.token;
  const shuttle = await post({ title: "送迎バス", body: "松本駅から1日2便" }, undefined, shop);
  assert.equal((await shuttle.json()).issuer.name, "山の宿");
  assert.equal((await post({ title: "x", body: "y", reelId: spot }, undefined, shop)).status, 400);

  // Edit and delete only your own.
  assert.equal((await call("PUT", `/api/local-transit/${taxi.id}`, { title: "乗合タクシー（予約制）", body: "前日17時までに電話で予約", reelId: spot }, muni)).json.title, "乗合タクシー（予約制）");
  assert.equal((await call("PUT", `/api/local-transit/${taxi.id}`, { title: "乗っ取り", body: "x" }, shop)).status, 404);
  assert.equal((await call("DELETE", `/api/local-transit/${busJson.id}`, undefined, shop)).status, 404);
  assert.deepEqual((await call("GET", "/api/local-transit/mine", undefined, muni)).json.items.map((x: any) => x.title).sort(), ["コミュニティバス 市内線", "乗合タクシー（予約制）", "夏季臨時バス"].sort());
  assert.equal((await call("DELETE", `/api/local-transit/${busJson.id}`, undefined, muni)).status, 204);
  assert.equal((await fetch(`${base}${busJson.fileUrl}`)).status, 404, "the file goes too");

  // Without a Claude key the AI reading says so (type it in instead).
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "a.png");
  const read = await fetch(`${base}/api/local-transit/read`, { method: "POST", headers: { Authorization: `Bearer ${muni}` }, body: form });
  assert.deepEqual([read.status, (await read.json()).code], [503, "aiUnavailable"]);
});

test("管理者サイト: only ADMIN_EMAILS get in; overview, inquiries, users (suspend, plan), reported comments, and a log of it all", async () => {
  const boss = (await call("POST", "/api/auth/register", { email: "Boss@example.com", password: "password123", name: "運営者" })).json;
  const someone = (await call("POST", "/api/auth/register", { email: "someone@example.com", password: "password123", name: "ふつうの人" })).json;
  process.env.ADMIN_EMAILS = "other@example.com,\n boss@example.com ";
  try {
    const denied = await call("GET", "/api/admin/overview", undefined, someone.token);
    assert.deepEqual([denied.status, denied.json.code, denied.json.configured], [403, "notAdmin", true]);
    assert.equal((await call("GET", "/api/admin/overview")).status, 401);
    assert.equal((await call("GET", "/api/admin/me", undefined, boss.token)).json.admin, true);
    // The app learns it can show the admin link.
    assert.equal((await call("POST", "/api/auth/login", { email: "Boss@example.com", password: "password123" })).json.user.isAdmin, true);
    assert.equal((await call("POST", "/api/auth/login", { email: "someone@example.com", password: "password123" })).json.user.isAdmin, false);

    const overview = (await call("GET", "/api/admin/overview", undefined, boss.token)).json;
    assert.ok(overview.users.total >= 2);
    assert.equal(overview.users.signupsByDay.length, 14);
    assert.ok(overview.users.signupsByDay.at(-1).count >= 2);
    assert.equal(typeof overview.ai.monthlyBudgetMicroUsd, "number");
    assert.equal(typeof overview.plans.monthlyYen, "number");

    // お問い合わせ: open → done.
    await call("POST", "/api/inquiries", { name: "問い合わせ人", email: "ask@example.com", message: "掲載について教えてください" });
    const open = (await call("GET", "/api/admin/inquiries", undefined, boss.token)).json.items;
    const inquiry = open.find((i: any) => i.message === "掲載について教えてください");
    assert.ok(inquiry);
    assert.equal((await call("PATCH", `/api/admin/inquiries/${inquiry.id}`, { done: true }, boss.token)).status, 204);
    assert.equal((await call("GET", "/api/admin/inquiries?status=done", undefined, boss.token)).json.items.some((i: any) => i.id === inquiry.id), true);

    // Users: search, give a plan, suspend (signed out at once, can't sign in), restore.
    const found = (await call("GET", "/api/admin/users?q=someone", undefined, boss.token)).json;
    assert.deepEqual(found.items.map((u: any) => u.email), ["someone@example.com"]);
    assert.equal((await call("POST", `/api/admin/users/${someone.user.id}/plan`, { plan: "business", months: 3 }, boss.token)).status, 400, "not for a traveler");
    assert.equal((await call("POST", `/api/admin/users/${someone.user.id}/plan`, { plan: "plus", months: 3 }, boss.token)).status, 200);
    assert.equal((await call("GET", "/api/points", undefined, someone.token)).json.ai.plan, "plus");
    assert.equal((await call("POST", `/api/admin/users/${boss.user.id}/suspend`, { suspended: true }, boss.token)).status, 400);
    assert.equal((await call("POST", `/api/admin/users/${someone.user.id}/suspend`, { suspended: true, reason: "スパム" }, boss.token)).status, 204);
    const blocked = await call("GET", "/api/points", undefined, someone.token);
    assert.deepEqual([blocked.status, blocked.json.code], [401, "suspended"]);
    assert.equal((await call("POST", "/api/auth/login", { email: "someone@example.com", password: "password123" })).json.code, "suspended");
    assert.equal((await call("POST", `/api/admin/users/${someone.user.id}/suspend`, { suspended: false }, boss.token)).status, 204);
    assert.equal((await call("GET", "/api/points", undefined, someone.token)).status, 200);

    // A reported comment: dismissed once, then removed.
    const reelId = (await call("GET", "/api/reels")).json.items[0].id;
    const comment = (await call("POST", `/api/reels/${reelId}/comments`, { body: "宣伝です" }, someone.token)).json;
    const reporter = (await call("POST", "/api/auth/register", { email: "reporter@example.com", password: "password123", name: "通報する人" })).json.token;
    const report = () => call("POST", `/api/reels/${reelId}/comments/${comment.id}/report`, { reason: "spam" }, reporter);
    assert.ok([200, 201, 204].includes((await report()).status));
    const reports = (await call("GET", "/api/admin/reports", undefined, boss.token)).json.items;
    const item = reports.find((r: any) => r.id === comment.id);
    assert.deepEqual([item.reports, item.reasons.spam, item.user.name], [1, 1, "ふつうの人"]);
    assert.equal((await call("POST", `/api/admin/reports/${comment.id}/dismiss`, undefined, boss.token)).status, 204);
    assert.equal((await call("GET", "/api/admin/reports", undefined, boss.token)).json.items.some((r: any) => r.id === comment.id), false);
    assert.equal((await call("DELETE", `/api/admin/comments/${comment.id}`, undefined, boss.token)).status, 204);

    // 連携の状況: which settings are there (never their values), forgiving of slips in the names.
    process.env.RAKUTEN_APPLICATION_ID = " app-id\n";
    const integrations = (await call("GET", "/api/admin/integrations", undefined, boss.token)).json.items;
    const rakuten = integrations.find((i: any) => i.id === "rakuten");
    assert.deepEqual([rakuten.ready, rakuten.parts], [false, { appId: true, accessKey: false, affiliateId: false }]);
    assert.equal(JSON.stringify(integrations).includes("app-id"), false);
    delete process.env.RAKUTEN_APPLICATION_ID;

    const logs = (await call("GET", "/api/admin/logs", undefined, boss.token)).json.items.map((l: any) => l.action);
    assert.deepEqual(logs.slice(0, 6), ["deleteComment", "dismissReports", "unsuspend", "suspend", "plan", "inquiryDone"]);
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
});

test("登録の承認: a new municipality or business waits for the operator before it can post, comment or be listed", async () => {
  delete process.env.POSTER_APPROVAL;
  process.env.ADMIN_EMAILS = "approver@example.com";
  try {
    const admin = (await call("POST", "/api/auth/register", { email: "approver@example.com", password: "password123", name: "運営" })).json.token;
    const town = (await call("POST", "/api/auth/register-municipality", { email: "kanko@city.example.lg.jp", password: "password123", name: "観光課", municipalityName: "審査町", prefecture: "長野県" })).json;
    assert.equal(town.user.approval, "pending");
    const mid = town.municipality.id;

    // Waiting: can sign in and look at its own page, but can't change anything, and isn't public.
    assert.equal((await call("GET", "/api/events/mine", undefined, town.token)).status, 200);
    const blocked = await call("POST", "/api/events", { title: "祭り", startDate: "2027-08-01", endDate: "2027-08-01" }, town.token);
    assert.deepEqual([blocked.status, blocked.json.code], [403, "pendingApproval"]);
    assert.equal((await call("PUT", "/api/municipalities/me/profile", { description: "x" }, town.token)).status, 403);
    const reelId = (await call("GET", "/api/reels")).json.items[0].id;
    assert.equal((await call("POST", `/api/reels/${reelId}/comments`, { body: "公式です" }, town.token)).json.code, "pendingApproval");
    assert.equal((await call("GET", `/api/municipalities/${mid}`)).status, 404);
    assert.equal((await call("GET", `/api/municipalities/${mid}`, undefined, town.token)).status, 200);
    assert.equal((await call("GET", "/api/municipalities")).json.some((m: any) => m.id === mid), false);
    assert.equal((await call("GET", "/api/search?q=審査町")).json.municipalities.length, 0);
    // A business can't join a town that isn't approved.
    assert.equal((await call("POST", "/api/auth/register-company", { email: "early@example.com", password: "password123", name: "早い人", companyName: "早い店", municipalityId: mid })).status, 400);

    // The admin console lists it with clues, and approves it.
    const overview = (await call("GET", "/api/admin/overview", undefined, admin)).json;
    assert.ok(overview.todo.pendingApprovals >= 1);
    const pending = (await call("GET", "/api/admin/approvals", undefined, admin)).json.items;
    const row = pending.find((u: any) => u.id === town.user.id);
    assert.deepEqual([row.municipality.name, row.emailDomain, row.officialDomain], ["審査町", "city.example.lg.jp", true]);
    assert.equal((await call("POST", `/api/admin/approvals/${town.user.id}`, { decision: "approve" }, admin)).status, 204);
    assert.equal((await call("POST", "/api/events", { title: "祭り", startDate: "2027-08-01", endDate: "2027-08-01" }, town.token)).status, 201);
    assert.equal((await call("GET", `/api/municipalities/${mid}`)).status, 200);
    assert.equal((await call("GET", "/api/auth/me", undefined, town.token)).json.user.approval, "approved");

    // A business under it: refused with a reason, which it sees.
    const shop = (await call("POST", "/api/auth/register-company", { email: "fake@example.com", password: "password123", name: "怪しい人", companyName: "なりすまし商店", municipalityId: mid })).json;
    assert.equal(shop.user.approval, "pending");
    assert.equal((await call("POST", `/api/admin/approvals/${shop.user.id}`, { decision: "reject", note: "確認の電話がつながりませんでした" }, admin)).status, 204);
    const me = (await call("GET", "/api/auth/me", undefined, shop.token)).json.user;
    assert.deepEqual([me.approval, me.approvalNote], ["rejected", "確認の電話がつながりませんでした"]);
    assert.equal((await call("POST", "/api/coupons", { title: "x", pointsCost: 10 }, shop.token)).json.code, "pendingApproval");
    assert.equal((await call("GET", "/api/admin/approvals?status=rejected", undefined, admin)).json.items[0].id, shop.user.id);
    assert.deepEqual((await call("GET", "/api/admin/logs", undefined, admin)).json.items.slice(0, 2).map((l: any) => l.action), ["reject", "approve"]);
    // Travelers aren't held up.
    assert.equal((await call("POST", "/api/auth/register", { email: "free@example.com", password: "password123", name: "旅人" })).json.user.approval, "approved");
  } finally {
    process.env.POSTER_APPROVAL = "off";
    delete process.env.ADMIN_EMAILS;
  }
});

test("管理者への通知: a sign-up waiting for approval and a new inquiry are pushed to the operator's devices", async () => {
  const webpush = (await import("web-push")).default;
  const sent: { endpoint: string; payload: any }[] = [];
  const send = mock.method(webpush, "sendNotification", async (sub: any, payload: string) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201, body: "", headers: {} };
  });
  delete process.env.POSTER_APPROVAL;
  process.env.ADMIN_EMAILS = "ops@example.com";
  try {
    const ops = (await call("POST", "/api/auth/register", { email: "Ops@example.com", password: "password123", name: "運営" })).json.token;
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    assert.equal((await call("POST", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/ops-phone", keys, lang: "ja" }, ops)).status, 204);
    const toOps = () => sent.filter((s) => s.endpoint.endsWith("ops-phone")).map((s) => s.payload);

    await call("POST", "/api/auth/register-municipality", { email: "new-town@example.com", password: "password123", name: "担当", municipalityName: "通知村", prefecture: "長野県" });
    await call("POST", "/api/inquiries", { name: "旅行会社A", email: "a@example.com", message: "提携について相談したいです" });
    for (let i = 0; i < 40 && toOps().length < 2; i++) await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(
      toOps().map((p) => [p.title, p.url]),
      [
        ["承認待ち：長野県通知村（自治体）", "/admin/approvals"],
        ["お問い合わせ：旅行会社A", "/admin/inquiries"],
      ]
    );
  } finally {
    send.mock.restore();
    process.env.POSTER_APPROVAL = "off";
    delete process.env.ADMIN_EMAILS;
  }
});

test("宿を探す: rooms free near a spot from 楽天トラベル (booking happens there), or a map search without the keys", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const q = `reelId=${castle.id}&checkin=${day(7)}&checkout=${day(8)}&adults=2`;

  // Not set up: no fake hotels, a map search to go on with.
  const off = (await call("GET", `/api/stays?${q}`)).json;
  assert.equal(off.configured, false);
  assert.deepEqual(off.items, []);
  assert.match(off.mapSearchUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal((await call("GET", `/api/stays?reelId=${castle.id}&checkin=2020-01-01&checkout=2020-01-02`)).status, 400);
  assert.equal((await call("GET", `/api/stays?reelId=${castle.id}&checkin=${day(7)}&checkout=${day(7)}`)).status, 400);

  process.env.RAKUTEN_APP_ID = "app-id";
  process.env.RAKUTEN_ACCESS_KEY = "access-key";
  process.env.RAKUTEN_AFFILIATE_ID = "aff-id";
  const asked: URL[] = [];
  const sentHeaders: any[] = [];
  const real = globalThis.fetch;
  const fetchMock = mock.method(globalThis, "fetch", async (input: any, init?: any) => {
    if (!String(input).includes("openapi.rakuten.co.jp")) return real(input, init);
    const url = new URL(String(input));
    asked.push(url);
    sentHeaders.push(init?.headers ?? {});
    if (url.searchParams.get("adultNum") === "9") return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    return new Response(
      JSON.stringify({
        hotels: [
          [
            { hotelBasicInfo: { hotelNo: 1234, hotelName: "松本城下の宿", hotelImageUrl: "https://img.travel.rakuten.co.jp/a.jpg", hotelMinCharge: 9800, reviewAverage: 4.4, reviewCount: 210, access: "松本駅から徒歩10分", nearestStation: "松本", address1: "長野県", address2: "松本市大手", latitude: 36.238, longitude: 137.969, hotelInformationUrl: "https://travel.rakuten.co.jp/HOTEL/1234/", planListUrl: "https://hotel.travel.rakuten.co.jp/hotelinfo/plan/1234" } },
            { roomInfo: [{ roomBasicInfo: { planName: "素泊まり", roomName: "和室", withBreakfastFlag: 0, withDinnerFlag: 0, reserveUrl: "https://hotel.travel.rakuten.co.jp/reserve/1" } }, { dailyCharge: { total: 23600 } }] },
            { roomInfo: [{ roomBasicInfo: { planName: "朝食付き", roomName: "洋室", withBreakfastFlag: 1, withDinnerFlag: 0, reserveUrl: "https://hotel.travel.rakuten.co.jp/reserve/2" } }, { dailyCharge: { total: 19600 } }] },
            { roomInfo: [{ roomBasicInfo: { planName: "怪しい", reserveUrl: "javascript:alert(1)" } }, { dailyCharge: { total: 1 } }] },
          ],
          [{ hotelBasicInfo: { hotelName: "番号なし" } }],
        ],
      })
    );
  });
  try {
    const on = (await call("GET", `/api/stays?${q}`)).json;
    assert.equal(on.configured, true);
    assert.deepEqual(on.items.map((h: any) => [h.name, h.minChargeYen, h.reviewAverage]), [["松本城下の宿", 9800, 4.4]]);
    // Cheapest first; only https booking links.
    assert.deepEqual(on.items[0].plans.map((p: any) => [p.name, p.totalYen, p.breakfast]), [["朝食付き", 19600, true], ["素泊まり", 23600, false]]);
    const sent = asked[0];
    assert.match(sent.pathname, /\/Travel\/VacantHotelSearch\/20170426$/);
    // Says which site it's for (楽天's allowed-websites check).
    assert.match(sentHeaders[0].Referer, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.deepEqual(
      ["applicationId", "accessKey", "affiliateId", "datumType", "adultNum", "checkinDate", "searchRadius"].map((k) => sent.searchParams.get(k)),
      ["app-id", "access-key", "aff-id", "1", "2", day(7), "3"]
    );
    assert.equal(Number(sent.searchParams.get("latitude")), castle.locationLat);
    // The same search again comes from the cache.
    await call("GET", `/api/stays?${q}`);
    assert.equal(asked.length, 1);
    // No rooms free is an empty list, not an error.
    const none = await call("GET", `/api/stays?reelId=${castle.id}&checkin=${day(7)}&checkout=${day(8)}&adults=9`);
    assert.deepEqual([none.status, none.json.items], [200, []]);
  } finally {
    fetchMock.mock.restore();
    delete process.env.RAKUTEN_APP_ID;
    delete process.env.RAKUTEN_ACCESS_KEY;
    delete process.env.RAKUTEN_AFFILIATE_ID;
  }
});

test("投稿から宿を予約: a lodging post finds its 楽天トラベル hotel by itself; every post lists real hotels near it", async () => {
  const { json: map } = await call("GET", "/api/reels/map");
  const inn = map.items.find((r: any) => r.locationName === "上高地帝国ホテル");
  const castle = map.items.find((r: any) => r.locationName === "松本城");
  process.env.RAKUTEN_APP_ID = "app-id";
  process.env.RAKUTEN_ACCESS_KEY = "access-key";
  const calls: URL[] = [];
  const basic = (no: number, name: string, lat: number, lng: number) => [
    { hotelBasicInfo: { hotelNo: no, hotelName: name, latitude: lat, longitude: lng, hotelMinCharge: 30000, planListUrl: `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${no}` } },
  ];
  const real = globalThis.fetch;
  const fetchMock = mock.method(globalThis, "fetch", async (input: any, init?: any) => {
    if (!String(input).includes("openapi.rakuten.co.jp")) return real(input, init);
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.includes("SimpleHotelSearch")) {
      return new Response(JSON.stringify({ hotels: [basic(501, "上高地温泉ホテル", 36.2451, 137.6382), basic(777, "上高地帝国ホテル", 36.2426, 137.6285)] }));
    }
    return new Response(JSON.stringify({ hotels: [] }), { status: 404 });
  });
  try {
    const near = (await call("GET", `/api/stays/near/${inn.id}`)).json;
    assert.deepEqual(near.linked, { no: 777, name: "上高地帝国ホテル" });
    assert.deepEqual(near.hotels.map((h: any) => h.id), [777, 501], "its own hotel first");
    // Remembered: the post now says which hotel it is, without asking again.
    const before = calls.filter((c) => c.searchParams.get("searchRadius") === "0.6").length;
    await call("GET", `/api/stays/near/${inn.id}`);
    assert.equal(calls.filter((c) => c.searchParams.get("searchRadius") === "0.6").length, before);
    assert.deepEqual((await call("GET", "/api/reels/map")).json.items.find((r: any) => r.id === inn.id).rakutenHotel, { no: 777, name: "上高地帝国ホテル" });
    // Not a lodging post: no hotel of its own, but the hotels around it.
    const castleNear = (await call("GET", `/api/stays/near/${castle.id}`)).json;
    assert.equal(castleNear.linked, null);
    assert.equal(castleNear.hotels.length, 2);

    // Booking dates: the post's own hotel is asked for by number.
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const vac = (await call("GET", `/api/stays?reelId=${inn.id}&checkin=${day(10)}&checkout=${day(11)}&adults=2`)).json;
    assert.equal(vac.linkedHotelNo, 777);
    assert.ok(calls.some((c) => c.pathname.includes("VacantHotelSearch") && c.searchParams.get("hotelNo") === "777"));

    // The poster (or an admin) can change it; others can't.
    const muni = await login("demo-matsumoto@example.com");
    const stranger = (await call("POST", "/api/auth/register", { email: "nosy@example.com", password: "password123", name: "通りすがり" })).json.token;
    assert.equal((await call("PUT", `/api/stays/link/${inn.id}`, { hotelNo: 501, name: "x" }, stranger)).status, 404);
    assert.equal((await call("GET", `/api/stays/candidates/${inn.id}`, undefined, muni)).json.hotels.length, 2);
    assert.deepEqual((await call("PUT", `/api/stays/link/${inn.id}`, { hotelNo: null }, muni)).json, { rakutenHotel: null });
    assert.deepEqual((await call("PUT", `/api/stays/link/${inn.id}`, { hotelNo: 777, name: "上高地帝国ホテル" }, muni)).json.rakutenHotel.no, 777);
  } finally {
    fetchMock.mock.restore();
    delete process.env.RAKUTEN_APP_ID;
    delete process.env.RAKUTEN_ACCESS_KEY;
  }
});

test("予約明細: bookings in the しおり, booking numbers for members only, read from a pasted email by the AI", async () => {
  const owner = (await call("POST", "/api/auth/register", { email: "booker@example.com", password: "password123", name: "予約する人" })).json.token;
  const trip = (await call("POST", "/api/me/trips", { name: "上高地の旅", startDate: "2027-05-20" }, owner)).json;
  const stay = { kind: "lodging", name: "上高地帝国ホテル", startAt: "2027-05-20T06:00:00.000Z", endAt: "2027-05-21T01:00:00.000Z", address: "長野県松本市安曇上高地", phone: "0263-95-2001", confirmation: "RY12345678", guests: 2, planName: "朝食付き", priceYen: 78000, payment: "onsite", bookedVia: "楽天トラベル", url: "https://travel.rakuten.co.jp/my/booking/1", note: "記念日" };
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/reservations`, { ...stay, endAt: "2027-05-19T00:00:00.000Z" }, owner)).status, 400, "ends before it starts");
  assert.equal((await call("POST", `/api/me/trips/${trip.id}/reservations`, { ...stay, url: "javascript:alert(1)" }, owner)).status, 400);
  const made = await call("POST", `/api/me/trips/${trip.id}/reservations`, stay, owner);
  assert.equal(made.status, 201);
  const dinner = (await call("POST", `/api/me/trips/${trip.id}/reservations`, { kind: "restaurant", name: "そば処", startAt: "2027-05-20T09:30:00.000Z" }, owner)).json;
  const it = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, owner)).json;
  assert.deepEqual(it.reservations.map((r: any) => [r.name, r.confirmation]), [["上高地帝国ホテル", "RY12345678"], ["そば処", ""]]);
  // Others can't touch it.
  const other = (await call("POST", "/api/auth/register", { email: "other-booker@example.com", password: "password123", name: "他人" })).json.token;
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/reservations/${dinner.id}`, undefined, other)).status, 404);
  // A shared link: what, where and when — no booking number, price, notes or booking page.
  const token = (await call("POST", `/api/me/trips/${trip.id}/share`, undefined, owner)).json.token;
  const shared = (await call("GET", `/api/trips/${token}`)).json.reservations[0];
  assert.deepEqual([shared.name, shared.address, shared.confirmation, shared.priceYen, shared.note, shared.url], ["上高地帝国ホテル", "長野県松本市安曇上高地", "", null, "", ""]);
  assert.equal((await call("PUT", `/api/me/trips/${trip.id}/reservations/${dinner.id}`, { kind: "restaurant", name: "そば処 上高地", startAt: "2027-05-20T10:00:00.000Z" }, owner)).status, 204);
  assert.equal((await call("DELETE", `/api/me/trips/${trip.id}/reservations/${dinner.id}`, undefined, owner)).status, 204);
  // 「予約へ」 in Jaziba writes it down at once as 手続き中; not on a shared link yet.
  const pending = (await call("POST", `/api/me/trips/${trip.id}/reservations`, { kind: "lodging", status: "pending", name: "上高地温泉ホテル", startAt: "2027-05-21T06:00:00.000Z", endAt: "2027-05-22T01:00:00.000Z", guests: 2, priceYen: 42000, bookedVia: "楽天トラベル" }, owner)).json;
  assert.equal(pending.status, "pending");
  assert.equal((await call("GET", `/api/trips/${token}`)).json.reservations.some((r: any) => r.id === pending.id), false);
  // The confirmation email (shared or pasted) fills in that one instead of adding another.
  const confirmed = await call("POST", `/api/me/trips/${trip.id}/reservations`, { kind: "lodging", name: "上高地温泉ホテル（楽天トラベル）", startAt: "2027-05-21T06:30:00.000Z", confirmation: "RY999" }, owner);
  assert.deepEqual([confirmed.status, confirmed.json.id, confirmed.json.status, confirmed.json.confirmation, confirmed.json.priceYen], [200, pending.id, "booked", "RY999", 42000]);
  // Or just 「予約できた」.
  const second = (await call("POST", `/api/me/trips/${trip.id}/reservations`, { kind: "restaurant", status: "pending", name: "山小屋カフェ", startAt: "2027-05-21T03:00:00.000Z" }, owner)).json;
  assert.equal((await call("PATCH", `/api/me/trips/${trip.id}/reservations/${second.id}`, { status: "booked", confirmation: "C-1" }, owner)).status, 204);
  const after = (await call("GET", `/api/me/trips/${trip.id}/itinerary`, undefined, owner)).json.reservations.find((r: any) => r.id === second.id);
  assert.deepEqual([after.status, after.confirmation], ["booked", "C-1"]);

  // Without a Claude key the AI reading says so.
  const read = await call("POST", `/api/me/trips/${trip.id}/reservations/read`, { text: "【楽天トラベル】ご予約ありがとうございます。予約番号：RY12345678 宿泊施設：上高地帝国ホテル" }, owner);
  assert.deepEqual([read.status, read.json.code], [503, "aiUnavailable"]);
});
