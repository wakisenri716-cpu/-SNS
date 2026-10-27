import { useEffect, useRef, useState } from "react";

const TRIGGER = 64;

// Native-app style pull-to-refresh for the page: dragging down while already
// at the top of the page reports how far (damped, capped) and calls
// onRefresh when released past the threshold. Touches that start inside an
// overlay (the fullscreen viewer, sheets, menus — all `.fixed`) are ignored.
export function usePullToRefresh(onRefresh: () => void) {
  const [pull, setPull] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let startY: number | null = null;
    let current = 0;
    const onStart = (e: TouchEvent) => {
      const inOverlay = (e.target as Element | null)?.closest?.(".fixed");
      startY = window.scrollY <= 0 && !inOverlay ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      current = dy > 0 ? Math.min(120, dy * 0.5) : 0;
      setPull(current);
    };
    const onEnd = () => {
      if (startY != null && current >= TRIGGER) refreshRef.current();
      startY = null;
      current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return { pull, progress: Math.min(1, pull / TRIGGER) };
}
