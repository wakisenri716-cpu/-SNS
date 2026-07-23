import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./locales/ja.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ko from "./locales/ko.json";

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

i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
    zh: { translation: zh },
    ko: { translation: ko },
  },
  lng: getInitialLanguage(),
  fallbackLng: "ja",
  interpolation: { escapeValue: false },
});

export function setAppLanguage(lang: SupportedLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
