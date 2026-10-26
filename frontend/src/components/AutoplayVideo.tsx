import { useEffect, useRef, type Ref } from "react";
import { setVideoVisible, useSoundOn } from "../lib/videoPlayback";

const DATA_SAVER_KEY = "tourism-sns-data-saver";

export function isDataSaverEnabled() {
  try {
    return localStorage.getItem(DATA_SAVER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDataSaverEnabled(enabled: boolean) {
  localStorage.setItem(DATA_SAVER_KEY, enabled ? "1" : "0");
}

// Plays while scrolled into view and pauses when scrolled away; which video
// actually plays (only one at a time) and whether it has sound is decided in
// lib/videoPlayback. Used anywhere a reel/PR video should start on its own
// instead of waiting for the viewer to press play.
//
// In data-saver mode (a device-local preference set in Settings), autoplay and
// preloading are both skipped — the viewer taps to play instead — to avoid
// burning mobile data on videos that scroll past unwatched.
export default function AutoplayVideo({
  src,
  className,
  videoRef,
  onAspectRatio,
}: {
  src: string;
  className: string;
  videoRef?: Ref<HTMLVideoElement>;
  onAspectRatio?: (ratio: number) => void;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const dataSaver = isDataSaverEnabled();
  const soundOn = useSoundOn();

  useEffect(() => {
    if (dataSaver) return;
    const el = ownRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVideoVisible(el, entry.isIntersecting), {
      threshold: 0.6,
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      setVideoVisible(el, false);
    };
  }, [dataSaver]);

  return (
    <video
      ref={(el) => {
        ownRef.current = el;
        if (typeof videoRef === "function") videoRef(el);
        else if (videoRef) videoRef.current = el;
      }}
      src={src}
      className={className}
      loop
      muted={!soundOn}
      playsInline
      controls={dataSaver}
      preload={dataSaver ? "none" : "auto"}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (onAspectRatio && v.videoWidth && v.videoHeight) onAspectRatio(v.videoWidth / v.videoHeight);
      }}
    />
  );
}
