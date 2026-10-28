import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Sparkles } from "lucide-react";

const ConciergeSheet = lazy(() => import("./ConciergeSheet"));

// Entry point to the AI travel concierge: a search-bar-like pill with a
// slowly turning gradient border.
export default function ConciergeButton({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`ai-border block w-full rounded-full p-[1.5px] text-left transition active:scale-[0.99] ${className}`}>
        <span className="flex items-center gap-3 rounded-full bg-white py-2.5 pl-2.5 pr-4">
          <span className="ai-orb flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-jz-ink">{t("concierge.title")}</span>
            <span className="block truncate text-xs text-gray-500">{t("concierge.buttonHint")}</span>
          </span>
          <Mic className="h-4 w-4 shrink-0 text-gray-500" />
        </span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <ConciergeSheet onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
