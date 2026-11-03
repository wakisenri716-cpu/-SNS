import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { ownAiUrl, type OwnAi } from "../lib/ownAi";
import { showToast } from "../lib/toast";

// 自分のAIで続ける: buttons that open the traveler's own ChatGPT or Claude
// with `prompt` written in (see lib/ownAi.ts), or copy / share it to any AI app.
export default function OwnAiButtons({ prompt, className = "" }: { prompt: string; className?: string }) {
  const { t } = useTranslation();
  const chip = "inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-jz-ink hover:bg-gray-50 active:scale-95";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      showToast(t("ownAi.copied"));
    } catch {
      showToast(t("ownAi.copyFailed"));
    }
  }
  return (
    <div className={`rounded-2xl bg-gray-50 p-3 ${className}`}>
      <p className="text-xs font-bold text-jz-ink">{t("ownAi.heading")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["chatgpt", "claude"] as OwnAi[]).map((ai) => (
          <a key={ai} href={ownAiUrl(ai, prompt)} target="_blank" rel="noopener noreferrer" className={chip}>
            {t(`ownAi.open.${ai}`)} <ExternalLink className="h-3 w-3" />
          </a>
        ))}
        <button type="button" onClick={() => void copy()} className={chip}>
          <Copy className="h-3 w-3" /> {t("ownAi.copy")}
        </button>
        {canShare && (
          <button type="button" onClick={() => void navigator.share({ text: prompt }).catch(() => {})} className={chip}>
            <Share2 className="h-3 w-3" /> {t("ownAi.share")}
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-gray-500">{t("ownAi.note")}</p>
    </div>
  );
}
