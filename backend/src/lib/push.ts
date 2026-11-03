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
  | { type: "arriveSoon"; name: string; to: string; time: string; minutes: number; tripId: string; transportId: string }
  | { type: "submissionReviewed"; approved: boolean; municipality: string; points: number; submissionId: string }
  | { type: "submissionPosted"; municipality: string; place: string; reelId: string }
  | { type: "couponExpiring"; title: string; issuer: string; until: string; redemptionId: string }
  // 登録の承認 (admin console): `path` is the account's dashboard.
  | { type: "accountReviewed"; approved: boolean; path: string }
  // To the operator (ADMIN_EMAILS): something waits in the admin site.
  | { type: "adminSignup"; name: string; kind: "MUNICIPALITY" | "COMPANY" }
  | { type: "adminInquiry"; name: string; preview: string };

const TEXT: Record<string, Record<PushMessage["type"], (m: any) => { title: string; body: string }>> = {
  ja: {
    newPost: (m) => ({ title: `${m.poster}の新しい投稿`, body: m.place }),
    like: (m) => ({ title: `${m.actor}さんがいいねしました`, body: m.place }),
    comment: (m) => ({ title: `${m.actor}さんがコメントしました`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} まもなく出発（約${m.minutes}分後）`, body: [`${m.from} ${m.time}発`, m.platform].filter(Boolean).join("・") }),
    arriveSoon: (m) => ({ title: `まもなく${m.to}に到着（約${m.minutes}分）`, body: `${m.name}・${m.time}着予定。降りる準備をしましょう` }),
    couponExpiring: (m) => ({ title: `クーポン「${m.title}」はもうすぐ期限です`, body: `${m.issuer}・${m.until.replace(/-/g, "/")}まで` }),
    submissionReviewed: (m) => (m.approved ? { title: `${m.municipality}があなたの写真・動画を承認しました`, body: `+${m.points}ポイント` } : { title: `${m.municipality}が今回の写真・動画を見送りました`, body: "マイページで理由を確認できます" }),
    submissionPosted: (m) => ({ title: `あなたの写真・動画が${m.municipality}の投稿になりました`, body: m.place }),
    accountReviewed: (m) => (m.approved ? { title: "ジャジバの登録が承認されました", body: "投稿や情報の編集ができるようになりました" } : { title: "ジャジバの登録は承認されませんでした", body: "管理画面で理由を確認できます" }),
    adminSignup: (m) => ({ title: `承認待ち：${m.name}（${m.kind === "MUNICIPALITY" ? "自治体" : "企業"}）`, body: "管理者サイトで確認してください" }),
    adminInquiry: (m) => ({ title: `お問い合わせ：${m.name}`, body: m.preview }),
  },
  en: {
    newPost: (m) => ({ title: `New post from ${m.poster}`, body: m.place }),
    like: (m) => ({ title: `${m.actor} liked your post`, body: m.place }),
    comment: (m) => ({ title: `${m.actor} commented`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} departs in about ${m.minutes} min`, body: [`${m.from} at ${m.time}`, m.platform].filter(Boolean).join(" · ") }),
    arriveSoon: (m) => ({ title: `Arriving at ${m.to} in about ${m.minutes} min`, body: `${m.name}, due ${m.time}. Get ready to get off` }),
    couponExpiring: (m) => ({ title: `Your coupon "${m.title}" ends soon`, body: `${m.issuer} · until ${m.until}` }),
    submissionReviewed: (m) => (m.approved ? { title: `${m.municipality} approved your photo/video`, body: `+${m.points} points` } : { title: `${m.municipality} passed on your photo/video this time`, body: "See why on My page" }),
    submissionPosted: (m) => ({ title: `Your photo/video is now a post by ${m.municipality}`, body: m.place }),
    accountReviewed: (m) => (m.approved ? { title: "Your Jaziba account is approved", body: "You can now post and edit your information" } : { title: "Your Jaziba registration wasn't approved", body: "See why on your dashboard" }),
    adminSignup: (m) => ({ title: `Awaiting approval: ${m.name} (${m.kind === "MUNICIPALITY" ? "municipality" : "business"})`, body: "Check it in the admin site" }),
    adminInquiry: (m) => ({ title: `Inquiry: ${m.name}`, body: m.preview }),
  },
  zh: {
    newPost: (m) => ({ title: `${m.poster}发布了新帖子`, body: m.place }),
    like: (m) => ({ title: `${m.actor}赞了你的帖子`, body: m.place }),
    comment: (m) => ({ title: `${m.actor}发表了评论`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} 约${m.minutes}分钟后出发`, body: [`${m.from} ${m.time}出发`, m.platform].filter(Boolean).join("・") }),
    arriveSoon: (m) => ({ title: `约${m.minutes}分钟后到达${m.to}`, body: `${m.name}・预计${m.time}到达，请准备下车` }),
    couponExpiring: (m) => ({ title: `优惠券「${m.title}」即将到期`, body: `${m.issuer}・${m.until.replace(/-/g, "/")}为止` }),
    submissionReviewed: (m) => (m.approved ? { title: `${m.municipality}批准了你的照片・视频`, body: `+${m.points}积分` } : { title: `${m.municipality}这次没有采用你的照片・视频`, body: "可在我的页面查看原因" }),
    submissionPosted: (m) => ({ title: `你的照片・视频已成为${m.municipality}的帖子`, body: m.place }),
    accountReviewed: (m) => (m.approved ? { title: "你的Jaziba注册已通过审核", body: "现在可以发布和编辑信息了" } : { title: "你的Jaziba注册未通过审核", body: "可在管理页面查看原因" }),
    adminSignup: (m) => ({ title: `待审核：${m.name}（${m.kind === "MUNICIPALITY" ? "地方政府" : "企业"}）`, body: "请在管理后台确认" }),
    adminInquiry: (m) => ({ title: `咨询：${m.name}`, body: m.preview }),
  },
  ko: {
    newPost: (m) => ({ title: `${m.poster}의 새 게시물`, body: m.place }),
    like: (m) => ({ title: `${m.actor}님이 좋아요를 눌렀습니다`, body: m.place }),
    comment: (m) => ({ title: `${m.actor}님이 댓글을 남겼습니다`, body: m.body }),
    departSoon: (m) => ({ title: `${m.name} 약 ${m.minutes}분 후 출발`, body: [`${m.from} ${m.time} 출발`, m.platform].filter(Boolean).join("・") }),
    arriveSoon: (m) => ({ title: `약 ${m.minutes}분 후 ${m.to} 도착`, body: `${m.name}・${m.time} 도착 예정. 내릴 준비를 하세요` }),
    couponExpiring: (m) => ({ title: `쿠폰 "${m.title}"의 기한이 곧 끝납니다`, body: `${m.issuer}・${m.until.replace(/-/g, "/")}까지` }),
    submissionReviewed: (m) => (m.approved ? { title: `${m.municipality}이(가) 사진・동영상을 승인했습니다`, body: `+${m.points}포인트` } : { title: `${m.municipality}이(가) 이번 사진・동영상을 보류했습니다`, body: "마이페이지에서 이유를 확인할 수 있습니다" }),
    submissionPosted: (m) => ({ title: `내 사진・동영상이 ${m.municipality}의 게시물이 되었습니다`, body: m.place }),
    accountReviewed: (m) => (m.approved ? { title: "Jaziba 가입이 승인되었습니다", body: "이제 게시와 정보 편집을 할 수 있습니다" } : { title: "Jaziba 가입이 승인되지 않았습니다", body: "관리 화면에서 이유를 확인할 수 있습니다" }),
    adminSignup: (m) => ({ title: `승인 대기: ${m.name} (${m.kind === "MUNICIPALITY" ? "지자체" : "기업"})`, body: "관리자 사이트에서 확인해 주세요" }),
    adminInquiry: (m) => ({ title: `문의: ${m.name}`, body: m.preview }),
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
      message.type === "accountReviewed"
        ? message.path
        : message.type === "adminSignup"
          ? "/admin/approvals"
          : message.type === "adminInquiry"
            ? "/admin/inquiries"
        : message.type === "newPost" || message.type === "submissionPosted"
        ? `/reels/${message.reelId}/access`
        : message.type === "submissionReviewed"
          ? "/mypage"
          : message.type === "couponExpiring"
            ? "/points?tab=mine"
        : message.type === "departSoon" || message.type === "arriveSoon"
          ? `/itinerary/${message.tripId}`
          : "/notifications",
    tag: `${message.type}-${message.type === "accountReviewed" || message.type === "adminSignup" || message.type === "adminInquiry" ? "account" : "transportId" in message ? message.transportId : "submissionId" in message ? message.submissionId : "redemptionId" in message ? message.redemptionId : message.reelId}`,
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
