import { useEffect, useRef, useState, type RefObject } from "react";

// "Ambient mode": samples the average color of a playing video a couple of
// times a second, so the card around it can glow in the footage's colors.
// Returns null until a frame is readable (or if the video is cross-origin).
export function useAmbientColor(videoRef: RefObject<HTMLVideoElement | null>) {
  const [color, setColor] = useState<string | null>(null);
  const hasColor = useRef(false);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!ctx || !v || v.readyState < 2 || (v.paused && hasColor.current)) return;
      try {
        ctx.drawImage(v, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
        const n = d.length / 4;
        // Push the average away from gray so the glow reads as a color.
        const avg = (r + g + b) / (3 * n);
        const boost = (c: number) => Math.round(Math.min(255, Math.max(0, avg + (c / n - avg) * 1.6)));
        hasColor.current = true;
        setColor(`rgb(${boost(r)}, ${boost(g)}, ${boost(b)})`);
      } catch {
        clearInterval(timer);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [videoRef]);

  return color;
}
