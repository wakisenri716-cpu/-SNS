import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, ChevronLeft, ChevronRight, ExternalLink, PictureInPicture2, X } from "lucide-react";
import { statusUrl } from "../lib/transitLinks";
import { splitDuration, transportPhase } from "../lib/transportTiming";
import { KIND_ICON, clock } from "../lib/transportDisplay";
import type { TripTransport } from "../types";

const ALARM_BEFORE_MIN = 5;

type WakeLockSentinelLike = { release: () => Promise<void> };
type DocumentPip = { requestWindow: (opts: { width: number; height: number }) => Promise<Window> };
const documentPip = () => (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;

// The page's styles, copied into the floating window so it looks the same.
function copyStyles(to: Window) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = to.document.createElement("style");
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      to.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = to.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        to.document.head.appendChild(link);
      }
    }
  }
  to.document.documentElement.className = document.documentElement.className;
  to.document.documentElement.lang = document.documentElement.lang;
}

// 移動中モード: one booked trip, big enough to read on a moving bus — how
// long until departure (and from which platform/gate), then how far along
// the ride is and how long until arrival. Optionally alerts 5 minutes before
// arrival (vibration + notification) so you don't miss your stop, and keeps
// the screen awake. Times are the ones the traveller entered; there's no
// live delay data, so the status link is one tap away. Where the browser
// can (Document Picture-in-Picture, desktop Chrome), 小窓で表示 keeps the
// countdown in a small window on top of other apps.
export default function TransitModeView({ transports, startId, onClose }: { transports: TripTransport[]; startId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const sorted = [...transports].sort((a, b) => new Date(a.departAt).getTime() - new Date(b.departAt).getTime());
  const [index, setIndex] = useState(() => Math.max(0, sorted.findIndex((tr) => tr.id === startId)));
  const [now, setNow] = useState(() => Date.now());
  const [alarmOn, setAlarmOn] = useState(false);
  // Minutes left when the alert went off (null until then).
  const [alarmFired, setAlarmFired] = useState<number | null>(null);
  const firedFor = useRef<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const tr = sorted[index];

  async function openPip() {
    const pip = documentPip();
    if (!pip) return;
    try {
      const w = await pip.requestWindow({ width: 320, height: 190 });
      copyStyles(w);
      w.document.title = t("transport.rideMode");
      w.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(w);
    } catch {
      setPipWindow(null);
    }
  }
  // Closing 移動中モード closes the small window too.
  useEffect(() => () => pipWindow?.close(), [pipWindow]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the screen on while this is open (taken again after returning to the tab).
  useEffect(() => {
    let lock: WakeLockSentinelLike | null = null;
    const take = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void take();
    const onVisible = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", onVisible);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onKey);
      void lock?.release().catch(() => {});
    };
  }, [onClose]);

  const { phase, toDepartMs, toArriveMs, progress } = transportPhase(tr, now);

  // Arrival alert: once, when we're within ALARM_BEFORE_MIN of arriving.
  useEffect(() => {
    if (!alarmOn || phase !== "enroute" || firedFor.current === tr.id) return;
    if (toArriveMs > ALARM_BEFORE_MIN * 60_000) return;
    firedFor.current = tr.id;
    const minutes = Math.max(1, Math.ceil(toArriveMs / 60_000));
    setAlarmFired(minutes);
    navigator.vibrate?.([400, 150, 400, 150, 400]);
    const body = t("transit.alarmBody", { place: tr.toName, minutes });
    if ("Notification" in window && Notification.permission === "granted") {
      void navigator.serviceWorker?.getRegistration().then((reg) => {
        if (reg) void reg.showNotification(t("transit.alarmTitle"), { body, tag: `arrive-${tr.id}` });
        else new Notification(t("transit.alarmTitle"), { body });
      });
    }
  }, [alarmOn, phase, toArriveMs, tr, t]);

  async function toggleAlarm() {
    if (alarmOn) return setAlarmOn(false);
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
    setAlarmOn(true);
  }

  const Icon = KIND_ICON[tr.kind];
  const dep = splitDuration(toDepartMs);
  const arr = splitDuration(toArriveMs);
  const big = (d: { h: number; m: number; s: number }) =>
    d.h > 0 ? t("transit.hm", { h: d.h, m: d.m }) : `${d.m}:${String(d.s).padStart(2, "0")}`;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("transport.rideMode")} className="on-media fixed inset-0 z-[75] flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={t("reelViewer.closeLabel")} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-xs font-semibold text-white/70">{t("transport.rideMode")}</p>
        <span className="w-11" />
      </div>

      <div className="flex flex-1 flex-col justify-center px-6" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-semibold text-white/75">
          <Icon className="h-5 w-5" /> {tr.operator && `${tr.operator}・`}
          {t(`transport.kind.${tr.kind}`)}
        </p>
        <p className="mt-1 text-4xl font-black leading-tight">{tr.name}</p>

        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div>
            <p className="text-3xl font-black tabular-nums">{clock(tr.departAt, i18n.language)}</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{tr.fromName}</p>
            {tr.departPlatform && <p className="mt-1 inline-block rounded-lg bg-white px-2 py-0.5 text-sm font-black text-slate-900">{tr.departPlatform}</p>}
          </div>
          <span className="text-2xl text-white/40">→</span>
          <div className="text-right">
            <p className="text-3xl font-black tabular-nums">{clock(tr.arriveAt, i18n.language)}</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{tr.toName}</p>
            {tr.arrivePlatform && <p className="mt-1 inline-block rounded-lg bg-white/20 px-2 py-0.5 text-sm font-bold">{tr.arrivePlatform}</p>}
          </div>
        </div>

        <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-jz-accent transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="mt-6 text-center">
          {phase === "arrived" ? (
            <p className="text-3xl font-black">{t("transit.arrived")}</p>
          ) : phase === "enroute" ? (
            <>
              <p className="text-sm font-semibold text-white/70">{t("transit.untilArrival", { place: tr.toName })}</p>
              <p className="text-6xl font-black tabular-nums">{big(arr)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white/70">{t("transit.untilDeparture")}</p>
              <p className="text-6xl font-black tabular-nums">{big(dep)}</p>
            </>
          )}
        </div>

        {alarmFired != null && firedFor.current === tr.id && phase !== "arrived" && (
          <p className="mt-5 animate-pulse rounded-2xl bg-jz-accent px-4 py-3 text-center text-base font-black">
            {t("transit.alarmBody", { place: tr.toName, minutes: alarmFired })}
          </p>
        )}

        {tr.seat && <p className="mt-6 text-center text-lg font-bold">{t("transport.seatValue", { seat: tr.seat })}</p>}
        {tr.confirmation && <p className="mt-1 text-center text-xs text-white/60">{t("transport.confirmationValue", { code: tr.confirmation })}</p>}
        {tr.note && <p className="mx-auto mt-3 max-w-sm whitespace-pre-wrap text-center text-xs text-white/70">{tr.note}</p>}
      </div>

      <div className="space-y-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void toggleAlarm()}
            aria-pressed={alarmOn}
            disabled={phase === "arrived"}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-bold disabled:opacity-40 ${alarmOn ? "bg-white text-slate-900" : "bg-white/10"}`}
          >
            {alarmOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {alarmOn ? t("transit.alarmOn", { minutes: ALARM_BEFORE_MIN }) : t("transit.alarm", { minutes: ALARM_BEFORE_MIN })}
          </button>
          {documentPip() && (
            <button
              type="button"
              onClick={() => (pipWindow ? pipWindow.close() : void openPip())}
              aria-pressed={!!pipWindow}
              aria-label={t("transit.pip")}
              title={t("transit.pip")}
              className={`flex items-center justify-center rounded-full px-4 ${pipWindow ? "bg-white text-slate-900" : "bg-white/10"}`}
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          )}
          <a href={statusUrl(tr.kind, tr.name, tr.operator)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-white/10 px-4 text-sm font-semibold">
            {t("transport.status")} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {sorted.length > 1 && (
          <div className="flex items-center justify-between text-xs text-white/70">
            <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" /> {t("transit.previous")}
            </button>
            <span className="tabular-nums">
              {index + 1} / {sorted.length}
            </span>
            <button type="button" disabled={index === sorted.length - 1} onClick={() => setIndex((i) => i + 1)} className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 disabled:opacity-30">
              {t("transit.next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        <p className="text-center text-[10px] text-white/50">{t("transit.timesNote")}</p>
      </div>
      {pipWindow &&
        createPortal(
          <div className="flex h-screen flex-col justify-center gap-1.5 bg-slate-900 px-4 text-white">
            <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-white/75">
              <Icon className="h-4 w-4 shrink-0" /> {tr.name}
            </p>
            <p className="text-[11px] text-white/70">
              {phase === "arrived" ? t("transit.arrived") : phase === "enroute" ? t("transit.untilArrival", { place: tr.toName }) : t("transit.untilDeparture")}
            </p>
            {phase !== "arrived" && <p className="text-4xl font-black tabular-nums">{big(phase === "enroute" ? arr : dep)}</p>}
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-jz-accent" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="truncate text-[11px] tabular-nums text-white/70">
              {clock(tr.departAt, i18n.language)} {tr.fromName}
              {tr.departPlatform && ` (${tr.departPlatform})`} → {clock(tr.arriveAt, i18n.language)} {tr.toName}
            </p>
          </div>,
          pipWindow.document.body
        )}
    </div>,
    document.body
  );
}
