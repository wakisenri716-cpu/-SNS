import { useTranslation } from "react-i18next";
import type { useTranslatable } from "../lib/useTranslatable";

// The "翻訳を見る" button's text for each state, including the on-device
// model's first download.
export default function TranslateButtonLabel({ tr }: { tr: ReturnType<typeof useTranslatable> }) {
  const { t } = useTranslation();
  if (tr.status === "loading") {
    return <>{tr.progress != null && tr.progress < 1 ? t("translation.downloading", { percent: Math.round(tr.progress * 100) }) : t("translation.loading")}</>;
  }
  if (tr.status === "failed") return <>{t("translation.failed")}</>;
  if (tr.status === "same") return <>{t("translation.sameLanguage")}</>;
  if (tr.status === "unsupported") return <>{t("translation.unsupported")}</>;
  return <>{tr.showing ? t("translation.showOriginal") : t("translation.show")}</>;
}
