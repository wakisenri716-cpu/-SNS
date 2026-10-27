import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation, Volume2, VolumeX, X } from "lucide-react";
import Avatar from "./Avatar";
import { setVideoVisible, toggleSound, useSoundOn } from "../lib/videoPlayback";
import { markStorySeen } from "../lib/storiesSeen";
import { relativeTime } from "../lib/relativeTime";
import type { Reel } from "../types";

export interface StoryGroup {
  municipality: Reel["municipality"];
  reels: Reel[];
}

const HOLD_MS = 180;

// Stories: one municipality's posts played back to back, full screen, with a
// segmented progress bar. Tap the right side for next, left for previous,
// hold to pause, swipe down (or Esc) to close; at the end of one
// municipality it moves on to the next.
export default function StoryViewer({
  groups,
  startGroup,
  onClose,
}: {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const soundOn = useSoundOn();
  const [g, setG] = useState(startGroup);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const press = useRef<{ x: number; y: number; at: number; held: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);

  const group = groups[g];
  const reel = group.reels[i];

  function next() {
    if (i + 1 < group.reels.length) setI(i + 1);
    else if (g + 1 < groups.length) {
      setG(g + 1);
      setI(0);
    } else onClose();
  }
  function prev() {
    if (i > 0) setI(i - 1);
    else if (g > 0) {
      setG(g - 1);
      setI(0);
    }
  }

  // The story video becomes the one playing video app-wide (the feed pauses
  // underneath and resumes on close).
  useEffect(() => {
    markStorySeen(reel.id);
    setPaused(false);
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    setVideoVisible(el, true);
    return () => setVideoVisible(el, false);
  }, [reel.id]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && barRef.current && v.duration) barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(e: PointerEvent) {
    const state = { x: e.clientX, y: e.clientY, at: Date.now(), held: false } as NonNullable<typeof press.current>;
    state.timer = setTimeout(() => {
      state.held = true;
      setPaused(true);
      videoRef.current?.pause();
    }, HOLD_MS);
    press.current = state;
  }

  function onPointerUp(e: PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (e.clientY - p.y > 90) return onClose();
    if (p.held) {
      setPaused(false);
      videoRef.current?.play().catch(() => {});
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) prev();
    else next();
  }

  return (
    <div className="on-media animate-viewer-in fixed inset-0 z-[60] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={group.municipality.name}>
      <div className="relative h-full w-full overflow-hidden md:h-[min(92dvh,900px)] md:w-auto md:aspect-[9/16] md:rounded-3xl">
        <video
          key={reel.id}
          ref={videoRef}
          src={reel.videoUrl}
          className="animate-fade-in h-full w-full object-cover"
          playsInline
          muted={!soundOn}
          onEnded={next}
        />

        {/* Tap/hold/swipe surface */}
        <div
          className="absolute inset-0 z-10 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (press.current = null)}
          aria-label={t("stories.tapHint")}
        />

        {/* Top: progress segments, poster, controls */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/60 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity ${
            paused ? "opacity-0" : ""
          }`}
        >
          <div className="flex gap-1">
            {group.reels.map((r, k) => (
              <span key={r.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                {k < i && <span className="block h-full w-full bg-white" />}
                {k === i && <span ref={barRef} className="block h-full w-full origin-left bg-white" style={{ transform: "scaleX(0)" }} />}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-white">
            <Avatar name={group.municipality.name} src={group.municipality.avatarUrl} size={32} />
            <span className="truncate text-sm font-semibold">{reel.postedByCompany?.name ?? group.municipality.name}</span>
            <span className="shrink-0 text-xs text-white/70">{relativeTime(reel.createdAt, i18n.language)}</span>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? t("feed.soundOff") : t("feed.soundOn")}
              className="pointer-events-auto ml-auto flex h-9 w-9 items-center justify-center"
            >
              {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("reelViewer.closeLabel")}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Bottom: place, caption, actions */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-24 text-white transition-opacity ${
            paused ? "opacity-0" : ""
          }`}
        >
          {reel.locationName && (
            <p className="flex items-center gap-1 text-lg font-bold">
              <MapPin className="h-4 w-4" /> {reel.locationName}
            </p>
          )}
          {reel.caption && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-white/85">{reel.caption}</p>}
          <div className="mt-3 flex gap-2">
            {reel.locationLat != null && reel.locationLng != null && (
              <Link
                to={`/reels/${reel.id}/access`}
                state={{ reel }}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-jz-red px-4 py-2.5 text-sm font-bold text-white active:scale-95"
              >
                <Navigation className="h-4 w-4 fill-white" /> {t("feed.directions")}
              </Link>
            )}
            <Link
              to={`/municipalities/${group.municipality.id}`}
              className="glass-dark pointer-events-auto rounded-full px-4 py-2.5 text-sm font-semibold text-white active:scale-95"
            >
              {t("stories.viewProfile")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
