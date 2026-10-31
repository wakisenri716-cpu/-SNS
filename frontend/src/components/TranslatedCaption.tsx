import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { api } from "../api/client";
import { useTranslatable } from "../lib/useTranslatable";
import TranslateButtonLabel from "./TranslateButtonLabel";

// A post's caption with "翻訳を見る" for travelers using the app in another
// language: Claude's translation (cached server-side) when configured, or
// the browser's built-in AI on the device; flips back to the original.
export default function TranslatedCaption({ reelId, caption }: { reelId: string; caption: string }) {
  const { t } = useTranslation();
  const tr = useTranslatable(caption, {
    // Posters write in Japanese.
    source: "ja",
    fromServer: async (lang) => (await api.post<{ caption: string }>(`/reels/${reelId}/translation`, { lang })).data.caption,
  });

  return (
    <div>
      <p className="leading-relaxed">{tr.text}</p>
      {tr.available && (
        <button
          type="button"
          onClick={() => void tr.toggle()}
          disabled={tr.status === "loading"}
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-jz-ink"
        >
          <Languages className="h-3.5 w-3.5" />
          <TranslateButtonLabel tr={tr} />
        </button>
      )}
      {tr.showing && <p className="mt-0.5 text-[11px] text-gray-500">{tr.by === "claude" ? t("translation.byClaude") : t("translation.byDevice")}</p>}
    </div>
  );
}
