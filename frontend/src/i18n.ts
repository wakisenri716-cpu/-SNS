import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./locales/ja.json";

export const LANGUAGE_STORAGE_KEY = "tourism-sns-language";
export const SUPPORTED_LANGUAGES = ["ja", "en", "zh", "ko"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function getInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage;
  }
  return "ja";
}

// Japanese (the default and fallback) is bundled; the other languages are
// separate chunks fetched only when someone actually uses them.
const LOADERS: Record<Exclude<SupportedLanguage, "ja">, () => Promise<{ default: object }>> = {
  en: () => import("./locales/en.json"),
  zh: () => import("./locales/zh.json"),
  ko: () => import("./locales/ko.json"),
};

async function ensureLanguageLoaded(lang: SupportedLanguage) {
  if (lang === "ja" || i18n.hasResourceBundle(lang, "translation")) return;
  const { default: messages } = await LOADERS[lang]();
  i18n.addResourceBundle(lang, "translation", messages);
}

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja } },
  lng: "ja",
  fallbackLng: "ja",
  interpolation: { escapeValue: false },
});

// A returning visitor who chose another language: switch once it's loaded
// (the page shows Japanese for that moment rather than blocking on it).
const initial = getInitialLanguage();
if (initial !== "ja") {
  void ensureLanguageLoaded(initial).then(() => i18n.changeLanguage(initial));
}

export async function setAppLanguage(lang: SupportedLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  await ensureLanguageLoaded(lang);
  await i18n.changeLanguage(lang);
}

export default i18n;

// Keep <html lang> matching the UI language: screen readers, the browser's
// translate prompt, and CJK glyph selection (ja vs zh forms) all rely on it.
document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
