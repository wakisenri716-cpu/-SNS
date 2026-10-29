// First visit, nothing chosen yet: use the browser's preferred languages
// (navigator.languages, in order), so a traveler from abroad doesn't land on
// a Japanese-only screen. Any Chinese variant gets the (Simplified) Chinese
// UI — closer to readable than Japanese. Japanese if nothing matches.
export function detectLanguage(preferred: readonly string[]): "ja" | "en" | "zh" | "ko" {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "ja" || base === "en" || base === "zh" || base === "ko") return base;
  }
  return "ja";
}
