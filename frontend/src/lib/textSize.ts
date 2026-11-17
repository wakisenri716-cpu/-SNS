import { useSyncExternalStore } from "react";

// 文字の大きさ (設定): scales every text size in the app (the --text-*
// sizes in index.css) without changing the layout. Stored on this device;
// first applied by the inline script in index.html, before paint.
export type TextSizePref = "small" | "normal" | "large" | "xlarge";
export const TEXT_SIZES: readonly TextSizePref[] = ["small", "normal", "large", "xlarge"];
export const TEXT_SCALE: Record<TextSizePref, number> = { small: 0.9, normal: 1, large: 1.15, xlarge: 1.3 };
const KEY = "jaziba-text-size";
const listeners = new Set<() => void>();

export function getTextSizePref(): TextSizePref {
  try {
    const v = localStorage.getItem(KEY);
    return (TEXT_SIZES as readonly string[]).includes(v ?? "") ? (v as TextSizePref) : "normal";
  } catch {
    return "normal";
  }
}

export function setTextSizePref(pref: TextSizePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Storage unavailable: still change it for this visit.
  }
  document.documentElement.style.setProperty("--jz-text-scale", String(TEXT_SCALE[pref]));
  listeners.forEach((l) => l());
}

export function useTextSizePref() {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getTextSizePref);
}
