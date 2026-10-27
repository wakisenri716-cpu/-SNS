import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { api } from "../api/client";
import { useAiAvailable } from "../lib/aiStatus";

// A post's caption with "翻訳を見る" for travelers using the app in another
// language: fetches Claude's translation (cached server-side) and lets them
// flip back to the original. Shown only when Claude is configured.
export default function TranslatedCaption({ reelId, caption }: { reelId: string; caption: string }) {
  const { t, i18n } = useTranslation();
  const aiAvailable = useAiAvailable();
  const lang = i18n.language;
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const canTranslate = aiAvailable && lang !== "ja" && caption.trim().length > 0;
  const translated = translations[lang];

  async function toggle() {
    if (showing) return setShowing(false);
    if (translated) return setShowing(true);
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.post<{ caption: string }>(`/reels/${reelId}/translation`, { lang });
      setTranslations((prev) => ({ ...prev, [lang]: data.caption }));
      setShowing(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="leading-relaxed">{showing && translated ? translated : caption}</p>
      {canTranslate && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={loading}
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-jz-ink"
        >
          <Languages className="h-3.5 w-3.5" />
          {loading
            ? t("translation.loading")
            : failed
              ? t("translation.failed")
              : showing
                ? t("translation.showOriginal")
                : t("translation.show")}
        </button>
      )}
      {showing && translated && <p className="mt-0.5 text-[11px] text-gray-400">{t("translation.byClaude")}</p>}
    </div>
  );
}
