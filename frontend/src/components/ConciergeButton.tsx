import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Sparkles } from "lucide-react";

const ConciergeSheet = lazy(() => import("./ConciergeSheet"));

// Entry point to the AI travel concierge, looking like Instagram's search
// bar: a plain grey field with the question to ask.
export default function ConciergeButton({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-9 w-full items-center gap-2 rounded-lg bg-gray-100 px-3 text-left active:opacity-70 ${className}`}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-gray-500" />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-500">
          <span className="font-semibold text-jz-ink">{t("concierge.title")}</span>
          <span className="ml-2">{t("concierge.buttonHint")}</span>
        </span>
        <Mic className="h-4 w-4 shrink-0 text-gray-500" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <ConciergeSheet onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
