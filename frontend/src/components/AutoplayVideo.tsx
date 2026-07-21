import { useEffect, useRef } from "react";

// Plays while scrolled into view (muted, so autoplay isn't blocked by the browser),
// pauses when scrolled away. Used anywhere a reel/PR video should start playing on
// its own instead of waiting for the viewer to press play.
export default function AutoplayVideo({ src, className }: { src: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
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
  }, []);

  return <video ref={videoRef} src={src} className={className} loop muted playsInline />;
}
