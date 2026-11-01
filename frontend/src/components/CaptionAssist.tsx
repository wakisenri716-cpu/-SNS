import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { onDeviceRewriteSupported, rewriteOnDevice, type RewriteStyle } from "../lib/onDeviceRewrite";

const STYLES: RewriteStyle[] = ["appealing", "shorter", "polite"];

// 端末のAIで整える, under a post's text box: a suggestion from the browser's
// own AI that the poster can take or leave. Shown only where the browser has it.
export default function CaptionAssist({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working"; progress: number | null } | { kind: "done"; text: string } | { kind: "failed" }>({ kind: "idle" });
  if (!onDeviceRewriteSupported()) return null;

  async function run(style: RewriteStyle) {
    setState({ kind: "working", progress: null });
    try {
      const text = await rewriteOnDevice(value, style, { context: t("captionAssist.context"), onProgress: (p) => setState({ kind: "working", progress: p }) });
      setState(text ? { kind: "done", text } : { kind: "failed" });
    } catch {
      setState({ kind: "failed" });
    }
  }

  return (
    <div className="rounded-xl bg-jz-tint p-2.5 text-xs" aria-live="polite">
      <p className="flex items-center gap-1 font-semibold text-jz-ink">
        <Sparkles className="h-3.5 w-3.5 text-jz-accent" /> {t("captionAssist.heading")}
      </p>
      {state.kind === "done" ? (
        <>
          <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white p-2 text-gray-900">{state.text}</p>
          <p className="mt-1 text-[10px] text-gray-500">{t("captionAssist.note")}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(state.text);
                setState({ kind: "idle" });
              }}
              className="rounded-full bg-jz-accent px-3 py-1 text-[11px] font-bold text-white"
            >
              {t("captionAssist.use")}
            </button>
            <button type="button" onClick={() => setState({ kind: "idle" })} className="rounded-full px-3 py-1 text-[11px] font-semibold text-gray-600">
              {t("captionAssist.discard")}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!value.trim() || state.kind === "working"}
              onClick={() => void run(s)}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-jz-ink ring-1 ring-gray-200 disabled:opacity-50"
            >
              {t(`captionAssist.style.${s}`)}
            </button>
          ))}
          {state.kind === "working" && (
            <span className="self-center text-[11px] text-gray-600">
              {state.progress != null && state.progress < 1 ? t("commentSummary.downloading", { percent: Math.round(state.progress * 100) }) : t("captionAssist.working")}
            </span>
          )}
          {state.kind === "failed" && <span className="self-center text-[11px] text-jz-warm-text">{t("captionAssist.failed")}</span>}
        </div>
      )}
    </div>
  );
}
