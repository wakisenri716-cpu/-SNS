import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { api } from "../api/client";
import { useTranslatable } from "../lib/useTranslatable";
import TranslateButtonLabel from "./TranslateButtonLabel";

// A comment's text with "翻訳を見る": into the viewer's UI language,
// whatever language it was written in — by Claude (cached server-side) when
// configured, otherwise by the browser's built-in AI on the device.
export default function TranslatableComment({ reelId, commentId, body }: { reelId: string; commentId: string; body: string }) {
  const { t } = useTranslation();
  const tr = useTranslatable(body, {
    fromServer: async (lang) => (await api.post<{ body: string }>(`/reels/${reelId}/comments/${commentId}/translation`, { lang })).data.body,
  });

  return (
    <>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-700">{tr.text}</p>
      {tr.available && (
        <button
          type="button"
          onClick={() => void tr.toggle()}
          disabled={tr.status === "loading"}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-jz-ink"
        >
          <Languages className="h-3 w-3" />
          <TranslateButtonLabel tr={tr} />
          {tr.showing && <span className="font-normal">・{tr.by === "claude" ? t("translation.byClaude") : t("translation.byDevice")}</span>}
        </button>
      )}
    </>
  );
}
