import { useSyncExternalStore } from "react";

// Light/dark appearance: "system" follows the device setting. The class is
// first applied by the inline script in index.html (before paint, so there's
// no white flash); this module keeps it in sync afterwards.
export type ThemePref = "system" | "light" | "dark";
const KEY = "jaziba-theme";
const media = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply() {
  const dark = isDarkNow();
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b0d12" : "#ffffff");
  listeners.forEach((l) => l());
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Storage unavailable: still switch for this visit.
  }
  apply();
}

media.addEventListener("change", apply);

export function useThemePref() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getThemePref
  );
}

function isDarkNow() {
  const pref = getThemePref();
  return pref === "dark" || (pref === "system" && media.matches);
}

/** Whether dark mode is currently showing (whatever the preference). */
export function useIsDark() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isDarkNow
  );
}
