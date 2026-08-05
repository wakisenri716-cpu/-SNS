import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { TRANSIT_MODE_LABEL_KEY } from "../lib/transitModeLabels";
import { formatDateTime, localDateTimeToIso, nowAsDatetimeLocalValue } from "../lib/departureTime";
import type { TransitSuggestion } from "../types";

// Shared "origin + departure datetime -> estimated time/mode/fare" form, used
// by both the municipality-wide planner (MunicipalityProfilePage) and the
// per-reel planner (ReelAccessPage). `endpoint` is the specific
// GET /municipalities/:id/access-plan or GET /reels/:id/access-plan path to call.
export default function AccessPlannerForm({ endpoint }: { endpoint: string }) {
  const { t, i18n } = useTranslation();
  const [origin, setOrigin] = useState("");
  const [departureLocal, setDepartureLocal] = useState(nowAsDatetimeLocalValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransitSuggestion | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!origin.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.get(endpoint, {
        params: { origin: origin.trim(), datetime: localDateTimeToIso(departureLocal) },
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("accessPlanner.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder={t("accessPlanner.originPlaceholder")}
          className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500 lg:max-w-xs"
        />
        <input
          type="datetime-local"
          value={departureLocal}
          onChange={(e) => setDepartureLocal(e.target.value)}
          className="block rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
        />
        <button
          type="submit"
          disabled={loading || !origin.trim()}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? t("accessPlanner.searching") : t("accessPlanner.search")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {result && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          <span>🚉 {t("accessPlanner.departure", { time: formatDateTime(result.departureAt, i18n.language) })}</span>
          <span>🏁 {t("accessPlanner.arrival", { time: formatDateTime(result.arrivalAt, i18n.language) })}</span>
          <span>🕐 {t("accessPlanner.duration", { minutes: result.totalDurationMin })}</span>
          <span>
            {result.legs
              .map((leg) => t(TRANSIT_MODE_LABEL_KEY[leg.mode] ?? "accessPlanner.modeDrive"))
              .join(t("accessPlanner.modeSeparator"))}
          </span>
          <span>
            💴{" "}
            {result.estimatedFareYen > 0
              ? t("accessPlanner.fare", { yen: result.estimatedFareYen.toLocaleString() })
              : t("accessPlanner.fareFree")}
          </span>
          {result.isMock ? (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {t("municipalityProfile.mockData")}
            </span>
          ) : (
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
              {t("municipalityProfile.realData")}
            </span>
          )}
          <span className="w-full text-xs text-gray-400">{t("accessPlanner.fareDisclaimer")}</span>
          <span className="w-full text-xs text-gray-400">{t("accessPlanner.noTimetableDisclaimer")}</span>
        </div>
      )}
    </div>
  );
}
