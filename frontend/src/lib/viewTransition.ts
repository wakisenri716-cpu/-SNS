import { flushSync } from "react-dom";

// Runs a React state update inside a View Transition (so elements sharing a
// view-transition-name morph between the two states). Falls back to a plain
// update where unsupported or when the user prefers reduced motion.
export function withViewTransition(update: () => void): Promise<void> {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return Promise.resolve();
  }
  return document
    .startViewTransition(() => flushSync(update))
    .finished.catch(() => {});
}

export function isOnScreen(el: Element | null) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}
