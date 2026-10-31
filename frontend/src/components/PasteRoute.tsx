import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, ScanText } from "lucide-react";
import { showToast } from "../lib/toast";
import { routeComplete } from "../lib/saveRoute";
import { parseTransitText, rideDateTimes, type ParsedRoute } from "../lib/transitPaste";

// 乗換案内の結果から入力: paste (or read from the clipboard) the route text a
// transit app copies/shares. One ride fills the form; a route with transfers
// can be saved as one 乗る便 per ride.
export default function PasteRoute({
  day,
  onRead,
  onSaveAll,
  showRides = true,
}: {
  /** "YYYY-MM-DD" used when the text has no date */
  day: string;
  onRead: (route: ParsedRoute) => void;
  /** With it, a route with transfers can be saved as one 乗る便 per ride. */
  onSaveAll?: (route: ParsedRoute) => Promise<void>;
  /** List the rides read (off when the caller shows them itself). */
  showRides?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  const [status, setStatus] = useState<"idle" | "read" | "failed">("idle");
  const [saving, setSaving] = useState(false);
  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  function read(value: string) {
    const parsed = parseTransitText(value);
    if (!parsed) {
      setRoute(null);
      return setStatus("failed");
    }
    setStatus("read");
    setRoute(parsed);
    onRead(parsed);
  }

  async function fromClipboard() {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      if (value.trim()) read(value);
    } catch {
      showToast(t("transport.paste.clipboardDenied"));
    }
  }

  async function saveAll() {
    if (!route || !onSaveAll) return;
    setSaving(true);
    try {
      await onSaveAll(route);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? t("transport.error"));
      setSaving(false);
    }
  }

  const times = route && route.rides.length > 1 ? rideDateTimes(route.date ?? day, route.rides) : [];
  return (
    <div className="rounded-2xl bg-jz-tint p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-jz-ink">
        <ScanText className="h-4 w-4 text-jz-red" /> {t("transport.paste.title")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-600">{t("transport.paste.hint")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const value = e.clipboardData.getData("text");
          if (value) window.setTimeout(() => read(value), 0);
        }}
        rows={2}
        maxLength={4000}
        placeholder={t("transport.paste.placeholder")}
        aria-label={t("transport.paste.title")}
        className="mt-2 w-full resize-none rounded-xl bg-white px-3 py-2 text-xs text-jz-ink outline-none focus:ring-2 focus:ring-jz-red/30"
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {canReadClipboard && (
          <button type="button" onClick={() => void fromClipboard()} className="inline-flex items-center gap-1 rounded-full bg-jz-ink px-3 py-1.5 text-[11px] font-bold text-white">
            <ClipboardPaste className="h-3.5 w-3.5" /> {t("transport.paste.fromClipboard")}
          </button>
        )}
        <button type="button" disabled={!text.trim()} onClick={() => read(text)} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-jz-ink ring-1 ring-gray-200 disabled:opacity-40">
          {t("transport.paste.read")}
        </button>
      </div>
      {status === "failed" && <p className="mt-2 text-[11px] font-semibold text-jz-red">{t("transport.paste.failed")}</p>}
      {status === "read" && route && (
        <div className="mt-2 text-[11px] leading-relaxed text-gray-700" aria-live="polite">
          <p className="font-semibold text-emerald-700">{t("transport.paste.readOk", { count: route.rides.length })}</p>
          {route.rides.length > 1 && showRides && (
            <>
              <ol className="mt-1.5 space-y-1">
                {route.rides.map((r, i) => (
                  <li key={i} className="rounded-lg bg-white px-2 py-1 tabular-nums">
                    <b>{times[i].departAt.slice(11)}</b> {r.fromName || "?"} → <b>{times[i].arriveAt.slice(11)}</b> {r.toName || "?"}
                    {r.name && <span className="ml-1 text-gray-500">{r.name}</span>}
                  </li>
                ))}
              </ol>
              {!onSaveAll ? null : routeComplete(route) ? (
                <button type="button" disabled={saving} onClick={() => void saveAll()} className="mt-2 w-full rounded-full bg-jz-red py-2 text-xs font-bold text-white disabled:opacity-60">
                  {t("transport.paste.saveAll", { count: route.rides.length })}
                </button>
              ) : (
                <p className="mt-1 text-gray-500">{t("transport.paste.incomplete")}</p>
              )}
              {onSaveAll && <p className="mt-1 text-gray-500">{t("transport.paste.firstFilled")}</p>}
            </>
          )}
          {route.date == null && <p className="mt-1 text-gray-500">{t("transport.paste.noDate", { date: new Date(`${day}T00:00`).toLocaleDateString(i18n.language, { month: "numeric", day: "numeric", weekday: "short" }) })}</p>}
        </div>
      )}
    </div>
  );
}
