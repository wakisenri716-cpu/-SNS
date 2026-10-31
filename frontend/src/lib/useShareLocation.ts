import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { distanceKm } from "./geo";

// みんなの現在地 — my side: while switched on, sends my position to the
// others on this trip (POST /me/trips/:id/location) when I've moved or every
// 30 s, and keeps the screen awake (Screen Wake Lock) so the phone can stay
// on the しおり. Off when switched off or when the page closes; the server
// forgets it after 10 minutes either way.
const RESEND_MS = 30_000;
const MOVED_KM = 0.03;

type WakeLockSentinelLike = { release: () => Promise<void> };

export function useShareLocation(tripId: string) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<"denied" | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  function stop() {
    cleanup.current?.();
    cleanup.current = null;
    setSharing(false);
  }

  function start() {
    if (!navigator.geolocation) return setError("denied");
    setError(null);
    let last: { lat: number; lng: number; at: number } | null = null;
    let wake: WakeLockSentinelLike | null = null;
    const keepAwake = async () => {
      try {
        wake = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        wake = null;
      }
    };
    void keepAwake();
    // The lock is dropped whenever the page is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && void keepAwake();
    document.addEventListener("visibilitychange", onVisible);

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        const here = { lat: coords.latitude, lng: coords.longitude };
        if (last && now - last.at < RESEND_MS && distanceKm(last, here) < MOVED_KM) return;
        last = { ...here, at: now };
        void api.post(`/me/trips/${tripId}/location`, { ...here, accuracy: Math.round(coords.accuracy) }).catch(() => {});
      },
      (err) => {
        if (err.code !== err.PERMISSION_DENIED) return;
        setError("denied");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    cleanup.current = () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", onVisible);
      void wake?.release().catch(() => {});
      void api.delete(`/me/trips/${tripId}/location`).catch(() => {});
    };
    setSharing(true);
  }

  useEffect(() => () => cleanup.current?.(), [tripId]);

  return { sharing, error, start, stop };
}
