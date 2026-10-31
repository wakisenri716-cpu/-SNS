import webpush from "web-push";
import { prisma } from "../prisma";

// Web Push for お知らせ. The VAPID key pair comes from VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY, or is generated once and kept in the database (it must
// stay the same, or every existing subscription stops working).

let vapid: Promise<{ publicKey: string; privateKey: string }> | null = null;

export function getVapidKeys() {
  vapid ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const stored = await prisma.appSetting.findUnique({ where: { key: "vapidKeys" } });
    if (stored) return JSON.parse(stored.value) as { publicKey: string; privateKey: string };
    const keys = webpush.generateVAPIDKeys();
    // Two instances racing here: the first write wins and both use it.
    await prisma.appSetting.upsert({ where: { key: "vapidKeys" }, create: { key: "vapidKeys", value: JSON.stringify(keys) }, update: {} });
    const saved = await prisma.appSetting.findUniqueOrThrow({ where: { key: "vapidKeys" } });
    return JSON.parse(saved.value) as { publicKey: string; privateKey: string };
  })();
  vapid.catch(() => (vapid = null));
  return vapid;
}

// Push services want a contact for the sender: VAPID_SUBJECT if set,
// otherwise the site's own address, remembered from the first subscription.
async function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const stored = await prisma.appSetting.findUnique({ where: { key: "pushSiteOrigin" } });
  return stored?.value ?? "https://jaziba.jp";
}

export async function rememberSiteOrigin(origin: string) {
  if (!/^https:\/\//.test(origin)) return;
  await prisma.appSetting.upsert({ where: { key: "pushSiteOrigin" }, create: { key: "pushSiteOrigin", value: origin }, update: {} });
}

export type PushMessage =
  | { type: "newPost"; poster: string; place: string; reelId: string }
  | { type: "like"; actor: string; place: string; reelId: string }
  | { type: "comment"; actor: string; body: string; reelId: string }
  // 乗る便 (lib/transportAlerts.ts): `time` is the local departure/arrival "HH:MM".
  | { type: "departSoon"; name: string; from: string; platform: string; time: string; minutes: number; tripId: string; transportId: string }
  | { type: "arriveSoon"; name: string; to: string; time: string; minutes: number; tripId: string; transportId: string };

const TEXT: Record<string, Record<PushMessage["type"], (m: any) => { title: string; body: string }>> = {
  ja: {
    newPost: (m) => ({ title: `${m.poster}の新しい投稿`, body: m.place }),
    like: (m) => ({ title: `${m.actor}さんがいいねしました`, body: m.place }),
    comment: (m) => ({ title: `${m.actor}さんがコメントしました`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} まもなく出発（約${m.minutes}分後）`, body: [`${m.from} ${m.time}発`, m.platform].filter(Boolean).join("・") }),
    arriveSoon: (m) => ({ title: `まもなく${m.to}に到着（約${m.minutes}分）`, body: `${m.name}・${m.time}着予定。降りる準備をしましょう` }),
  },
  en: {
    newPost: (m) => ({ title: `New post from ${m.poster}`, body: m.place }),
    like: (m) => ({ title: `${m.actor} liked your post`, body: m.place }),
    comment: (m) => ({ title: `${m.actor} commented`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} departs in about ${m.minutes} min`, body: [`${m.from} at ${m.time}`, m.platform].filter(Boolean).join(" · ") }),
    arriveSoon: (m) => ({ title: `Arriving at ${m.to} in about ${m.minutes} min`, body: `${m.name}, due ${m.time}. Get ready to get off` }),
  },
  zh: {
    newPost: (m) => ({ title: `${m.poster}发布了新帖子`, body: m.place }),
    like: (m) => ({ title: `${m.actor}赞了你的帖子`, body: m.place }),
    comment: (m) => ({ title: `${m.actor}发表了评论`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} 约${m.minutes}分钟后出发`, body: [`${m.from} ${m.time}出发`, m.platform].filter(Boolean).join("・") }),
    arriveSoon: (m) => ({ title: `约${m.minutes}分钟后到达${m.to}`, body: `${m.name}・预计${m.time}到达，请准备下车` }),
  },
  ko: {
    newPost: (m) => ({ title: `${m.poster}의 새 게시물`, body: m.place }),
    like: (m) => ({ title: `${m.actor}님이 좋아요를 눌렀습니다`, body: m.place }),
    comment: (m) => ({ title: `${m.actor}님이 댓글을 남겼습니다`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} 약 ${m.minutes}분 후 출발`, body: [`${m.from} ${m.time} 출발`, m.platform].filter(Boolean).join("・") }),
    arriveSoon: (m) => ({ title: `약 ${m.minutes}분 후 ${m.to} 도착`, body: `${m.name}・${m.time} 도착 예정. 내릴 준비를 하세요` }),
  },
};

// What the service worker shows: text in the device's language, and where
// tapping it goes. `tag` collapses repeats for the same post.
export function pushPayload(message: PushMessage, lang: string) {
  const { title, body } = (TEXT[lang] ?? TEXT.ja)[message.type](message);
  return {
    title,
    body: body.length > 120 ? `${body.slice(0, 119)}…` : body,
    url:
      message.type === "newPost"
        ? `/reels/${message.reelId}/access`
        : message.type === "departSoon" || message.type === "arriveSoon"
          ? `/itinerary/${message.tripId}`
          : "/notifications",
    tag: `${message.type}-${"transportId" in message ? message.transportId : message.reelId}`,
  };
}

// Sends to every device of these users. Never throws; gone subscriptions are
// removed. Not awaited by callers, so a slow push service can't slow a request.
export async function sendPush(userIds: string[], message: PushMessage, { ttlSeconds = 24 * 60 * 60 }: { ttlSeconds?: number } = {}) {
  try {
    if (userIds.length === 0) return;
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (subs.length === 0) return;
    const keys = await getVapidKeys();
    const subject = await vapidSubject();
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(pushPayload(message, sub.lang)),
            { TTL: ttlSeconds, vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, timeout: 10_000 }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          else console.error("[push] send failed:", status ?? (err as Error).message);
        }
      })
    );
  } catch (err) {
    console.error("[push] Failed to send:", err);
  }
}
