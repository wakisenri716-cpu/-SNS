import { useTranslation } from "react-i18next";

/** "1時間32分" / "55分"-style length of a trip leg, in the UI language. */
export function useDuration() {
  const { t } = useTranslation();
  return (min: number) => (min >= 60 ? t("transit.hm", { h: Math.floor(min / 60), m: min % 60 }) : t("legOption.minutes", { minutes: min }));
}
