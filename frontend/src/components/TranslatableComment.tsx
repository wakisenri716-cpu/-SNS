import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { api } from "../api/client";
import { useAiAvailable } from "../lib/aiStatus";

// A comment's text with "翻訳を見る": into the viewer's UI language,
// whatever language it was written in (cached server-side). Shown only
// when Claude is configured.
export default function TranslatableComment({ reelId, commentId, body }: { reelId: string; commentId: string; body: string }) {
  const { t, i18n } = useTranslation();
  const aiAvailable = useAiAvailable();
  const lang = i18n.language;
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const translated = translations[lang];

  async function toggle() {
    if (showing) return setShowing(false);
    if (translated) return setShowing(true);
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.post<{ body: string }>(`/reels/${reelId}/comments/${commentId}/translation`, { lang });
      setTranslations((prev) => ({ ...prev, [lang]: data.body }));
      setShowing(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-700">{showing && translated ? translated : body}</p>
      {aiAvailable && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={loading}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-jz-ink"
        >
          <Languages className="h-3 w-3" />
          {loading
            ? t("translation.loading")
            : failed
              ? t("translation.failed")
              : showing
                ? t("translation.showOriginal")
                : t("translation.show")}
          {showing && translated && <span className="font-normal">・{t("translation.byClaude")}</span>}
        </button>
      )}
    </>
  );
}
