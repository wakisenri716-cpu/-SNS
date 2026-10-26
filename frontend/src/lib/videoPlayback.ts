import { useSyncExternalStore } from "react";

// App-wide video playback rules, Instagram-style:
// - only one video plays at a time: the one that most recently scrolled into
//   view (so a fullscreen viewer opened over the feed takes over, and the feed
//   video underneath resumes when the viewer closes);
// - sound is one shared on/off switch (off by default, since browsers only
//   allow autoplay while muted).

const visible: HTMLVideoElement[] = [];
let current: HTMLVideoElement | null = null;
let pickTimer: ReturnType<typeof setTimeout> | undefined;

function play(el: HTMLVideoElement) {
  if (current && current !== el) current.pause();
  current = el;
  el.muted = !soundOn;
  el.play().catch(() => {
    // Unmuted autoplay can be refused before the first user gesture; fall back to muted.
    if (!el.muted) {
      el.muted = true;
      el.play().catch(() => {});
    }
  });
}

// Deferred so that when one video leaves and another enters in the same frame
// (scrolling the viewer), the newcomer wins instead of a brief blip of another.
function pickNext() {
  clearTimeout(pickTimer);
  pickTimer = setTimeout(() => {
    if (current && visible.includes(current)) return;
    current = null;
    const next = visible[visible.length - 1];
    if (next) play(next);
  }, 60);
}

export function setVideoVisible(el: HTMLVideoElement, isVisible: boolean) {
  const i = visible.indexOf(el);
  if (i >= 0) visible.splice(i, 1);
  if (isVisible) {
    visible.push(el);
    play(el);
  } else {
    if (current === el) {
      el.pause();
      current = null;
    }
    pickNext();
  }
}

let soundOn = false;
const soundListeners = new Set<() => void>();

export function toggleSound() {
  soundOn = !soundOn;
  if (current) {
    current.muted = !soundOn;
    if (current.paused) current.play().catch(() => {});
  }
  soundListeners.forEach((l) => l());
}

export function useSoundOn() {
  return useSyncExternalStore(
    (l) => {
      soundListeners.add(l);
      return () => soundListeners.delete(l);
    },
    () => soundOn
  );
}
