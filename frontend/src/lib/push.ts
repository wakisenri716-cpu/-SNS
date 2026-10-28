import { api } from "../api/client";

// Web Push on this device (Settings → プッシュ通知). Needs the service worker,
// which is only registered in production builds; on iPhone, only once the app
// is added to the home screen.

export type PushState = "unsupported" | "needsInstall" | "denied" | "on" | "off";

const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function base64UrlToBytes(value: string) {
  const padded = (value + "===".slice((value.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!("PushManager" in window) || !("Notification" in window)) return isIos() && !isStandalone() ? "needsInstall" : "unsupported";
  const reg = await registration();
  if (!reg) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

// Must run from a tap (browsers only show the permission prompt then).
export async function enablePush(lang: string): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const { data } = await api.get<{ key: string }>("/push/public-key");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(data.key) }));
  const json = sub.toJSON();
  await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys, lang });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api.delete("/push/subscribe", { data: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

// On logout: stop this device getting the account's pushes. Unsubscribing
// locally is enough — the server drops the endpoint the next time the push
// service reports it gone — so it works even with an expired session.
export async function forgetPushOnThisDevice() {
  try {
    const sub = await (await registration())?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    // Nothing to undo.
  }
}
