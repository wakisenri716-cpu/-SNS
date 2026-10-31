import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { commentsForSummary, onDeviceSummarySupported, summarizeOnDevice } from "../lib/onDeviceSummarize";

/** Fewest comments worth summarizing. */
export const MIN_COMMENTS = 4;

// みんなの声をまとめる: a short summary of the comments, written by the
// browser's own AI (Chrome's Summarizer API) — on the device, free, nothing
// sent anywhere. Shown only where the browser has it.
export default function CommentSummary({ bodies }: { bodies: string[] }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working"; progress: number | null } | { kind: "done"; text: string } | { kind: "failed" }>({
    kind: "idle",
  });
  if (!onDeviceSummarySupported() || bodies.length < MIN_COMMENTS) return null;

  async function run() {
    setState({ kind: "working", progress: null });
    try {
      const result = await summarizeOnDevice(commentsForSummary(bodies), i18n.language, {
        context: t("commentSummary.context"),
        onProgress: (p) => setState({ kind: "working", progress: p }),
      });
      setState(result.kind === "summary" ? { kind: "done", text: result.text } : { kind: "failed" });
    } catch {
      setState({ kind: "failed" });
    }
  }

  return (
    <div className="mb-3 rounded-2xl bg-jz-tint p-3" aria-live="polite">
      {state.kind === "done" ? (
        <>
          <p className="flex items-center gap-1.5 text-xs font-bold text-jz-ink">
            <Sparkles className="h-3.5 w-3.5 text-jz-accent" /> {t("commentSummary.heading", { count: bodies.length })}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-jz-ink">{state.text}</p>
          <p className="mt-1.5 text-[10px] text-gray-500">{t("commentSummary.note")}</p>
        </>
      ) : (
        <button type="button" onClick={() => void run()} disabled={state.kind === "working"} className="flex w-full items-center gap-2 text-left disabled:opacity-70">
          <Sparkles className="h-4 w-4 shrink-0 text-jz-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-jz-ink">
              {state.kind === "working"
                ? state.progress != null && state.progress < 1
                  ? t("commentSummary.downloading", { percent: Math.round(state.progress * 100) })
                  : t("commentSummary.working")
                : t("commentSummary.button")}
            </span>
            <span className="block text-[11px] text-gray-600">{state.kind === "failed" ? t("commentSummary.failed") : t("commentSummary.sub")}</span>
          </span>
        </button>
      )}
    </div>
  );
}
