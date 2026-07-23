import { useEffect, useRef } from "react";

const DATA_SAVER_KEY = "tourism-sns-data-saver";

export function isDataSaverEnabled() {
  return localStorage.getItem(DATA_SAVER_KEY) === "1";
}

export function setDataSaverEnabled(enabled: boolean) {
  localStorage.setItem(DATA_SAVER_KEY, enabled ? "1" : "0");
}

// Plays while scrolled into view (muted, so autoplay isn't blocked by the browser),
// pauses when scrolled away. Used anywhere a reel/PR video should start playing on
// its own instead of waiting for the viewer to press play.
//
// In data-saver mode (a device-local preference set in Settings), autoplay and
// preloading are both skipped — the viewer taps to play instead — to avoid
// burning mobile data on videos that scroll past unwatched.
export default function AutoplayVideo({ src, className }: { src: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dataSaver = isDataSaverEnabled();

  useEffect(() => {
    if (dataSaver) return;
    const el = videoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [dataSaver]);

  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      loop
      muted
      playsInline
      controls={dataSaver}
      preload={dataSaver ? "none" : "auto"}
    />
  );
}
