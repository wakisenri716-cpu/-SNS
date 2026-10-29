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
