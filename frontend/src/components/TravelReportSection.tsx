import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ModeIcon from "./ModeIcon";
import type { TravelMode, TravelReports } from "../types";

const MODES: { mode: TravelMode; labelKey: string }[] = [
  { mode: "train", labelKey: "accessPlanner.modeTrain" },
  { mode: "bus", labelKey: "accessPlanner.modeBus" },
  { mode: "car", labelKey: "accessPlanner.modeDrive" },
  { mode: "taxi", labelKey: "reelAccessPage.modeTaxi" },
  { mode: "walk", labelKey: "accessPlanner.modeWalk" },
];
export const TRAVEL_MODE_LABEL_KEY = Object.fromEntries(MODES.map((m) => [m.mode, m.labelKey])) as Record<TravelMode, string>;

// Same normalization the backend applies before storing, so a searched origin
// can be matched against reported ones.
export function normalizeOrigin(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

type Result = { pointsAwarded: number; points: number };

// Pitch deck 「平均所要時間はユーザー自身がポイント獲得のために計測」: a traveler who
// actually made the trip records how long it took (earning points), and the
// collected reports are shown back as 「みんなの実測」 averages. See
// POST/GET /reels/:id/travel-reports.
export default function TravelReportSection({
  reelId,
  defaultOrigin,
  reports,
  onSaved,
}: {
  reelId: string;
  defaultOrigin: string;
  reports: TravelReports | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { user, municipality, company } = useAuth();
  const isTraveler = !!user && !municipality && !company;

  // null until the user edits it, so it follows the origin searched above.
  const [origin, setOrigin] = useState<string | null>(null);
  const [mode, setMode] = useState<TravelMode>("train");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const originValue = origin ?? defaultOrigin;
  const durationMin = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!normalizeOrigin(originValue) || durationMin <= 0) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<Result>(`/reels/${reelId}/travel-reports`, {
        mode,
        durationMin,
        originLabel: normalizeOrigin(originValue),
      });
      setResult(data);
      setHours("");
      setMinutes("");
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("travelReport.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const summary = reports?.summary ?? [];

  return (
    <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white p-4 lg:p-5">
      <h2 className="text-sm font-bold text-gray-900">{t("travelReport.heading")}</h2>
      <p className="mt-0.5 text-xs text-gray-400">{t("travelReport.subtitle")}</p>

      {summary.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {summary.map((g) => (
            <li key={`${g.originLabel}-${g.mode}`} className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-700">
              <span className="font-semibold">{t("travelReport.fromOrigin", { origin: g.originLabel })}</span>
              <span className="inline-flex items-center gap-1">
                <ModeIcon mode={g.mode} className="h-3.5 w-3.5" /> {t(TRAVEL_MODE_LABEL_KEY[g.mode])}
              </span>
              <span className="font-bold tabular-nums text-gray-900">
                {t("travelReport.average", { minutes: g.averageMin })}
              </span>
              <span className="text-gray-400">{t("travelReport.count", { count: g.count })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-gray-400">{t("travelReport.noReports")}</p>
      )}
      {(reports?.hiddenCount ?? 0) > 0 && (
        <p className="mt-1.5 text-[11px] text-gray-400">{t("travelReport.hiddenCount", { count: reports!.hiddenCount })}</p>
      )}
      {(reports?.mine.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-gray-500">{t("travelReport.mineHeading")}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {reports!.mine.map((m) => (
              <li key={m.mode} className="text-xs text-gray-600">
                {t("travelReport.fromOrigin", { origin: m.originLabel })} {t(TRAVEL_MODE_LABEL_KEY[m.mode])}{" "}
                {t("travelReport.mineDuration", { minutes: m.durationMin })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        {!user ? (
          <p className="text-xs text-gray-500">
            <Link to="/login" className="font-semibold text-gray-900 hover:underline">
              {t("travelReport.loginCta")}
            </Link>
          </p>
        ) : !isTraveler ? (
          <p className="text-xs text-gray-400">{t("travelReport.travelersOnly")}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-900">{t("travelReport.pointsNote")}</p>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-500">{t("travelReport.originLabel")}</span>
              <input
                value={originValue}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder={t("accessPlanner.originPlaceholder")}
                className="w-full rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
              <span className="text-[11px] leading-relaxed text-amber-700">{t("travelReport.originPrivacyNote")}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setMode(m.mode)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                    mode === m.mode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <ModeIcon mode={m.mode} className="h-3.5 w-3.5" /> {t(m.labelKey)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-16 rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                />
                {t("travelReport.hours")}
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-16 rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                />
                {t("travelReport.minutes")}
              </label>
              <button
                type="submit"
                disabled={saving || !normalizeOrigin(originValue) || durationMin <= 0 || durationMin > 24 * 60}
                className="ml-auto rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {t("travelReport.submit")}
              </button>
            </div>
            {result && (
              <p className="text-xs font-semibold text-emerald-700">
                {result.pointsAwarded > 0
                  ? t("travelReport.earned", { points: result.pointsAwarded, total: result.points })
                  : t("travelReport.updated", { total: result.points })}
              </p>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </form>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">{t("travelReport.disclaimer")}</p>
      </div>
    </div>
  );
}
