import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import AutoplayVideo from "../components/AutoplayVideo";
import SchematicRouteMap from "../components/SchematicRouteMap";
import { formatDateTime, localDateTimeToIso, nowAsDatetimeLocalValue } from "../lib/departureTime";
import {
  deriveModeEstimates,
  pickRecommendedMode,
  reasonTagKeys,
  type AccessMode,
  type GroupSize,
  type ModeEstimate,
} from "../lib/accessModeEstimate";
import type { Reel, TransitSuggestion } from "../types";

const MODE_ICON: Record<AccessMode, string> = { train: "🚃", bus: "🚌", car: "🚗", taxi: "🚕", walk: "🚶" };
const MODE_LABEL_KEY: Record<AccessMode, string> = {
  train: "accessPlanner.modeTrain",
  bus: "accessPlanner.modeBus",
  car: "accessPlanner.modeDrive",
  taxi: "reelAccessPage.modeTaxi",
  walk: "accessPlanner.modeWalk",
};
// Bus and taxi are the two modes with practical booking friction (seat
// reservations, on-demand dispatch) worth calling out — but the app doesn't
// integrate any real booking backend, so this stays informational text, not
// a "予約する" button/flow that would imply a reservation actually happened.
const RESERVATION_NOTE_KEY: Partial<Record<AccessMode, string>> = {
  bus: "reelAccessPage.reservationNoteBus",
  taxi: "reelAccessPage.reservationNoteTaxi",
};

function GroupSizeToggle({ value, onChange }: { value: GroupSize; onChange: (v: GroupSize) => void }) {
  const { t } = useTranslation();
  const options: { key: GroupSize; labelKey: string }[] = [
    { key: "solo", labelKey: "reelAccessPage.groupSolo" },
    { key: "couple", labelKey: "reelAccessPage.groupCouple" },
    { key: "family", labelKey: "reelAccessPage.groupFamily" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            value === o.key ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}

// Route-preview image (see GET /reels/:id/access-map). Falls back to a plain
// schematic dashed-line diagram — clearly labeled as such — when the real
// map can't be produced (Static Maps not configured/enabled, origin not
// geocodable, or the request just failed), rather than showing nothing or
// silently pretending the schematic is a real map.
function RouteMap({ reelId, origin, destinationLabel }: { reelId: string; origin: string; destinationLabel: string }) {
  const [failed, setFailed] = useState(false);
  const src = `/api/reels/${reelId}/access-map?origin=${encodeURIComponent(origin)}`;

  if (failed) {
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
        <SchematicRouteMap
          className="h-28 md:h-36"
          points={[
            { x: 15, y: 80, label: origin },
            { x: 85, y: 20, label: destinationLabel },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <img src={src} alt="" className="h-28 w-full object-cover md:h-36" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

function Switch({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={onToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${active ? "bg-teal-600" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </label>
  );
}

function ModeCard({
  estimate,
  recommended,
  reelId,
  origin,
  destinationLabel,
  departureAt,
  accessibility,
  hasCar,
  groupSize,
}: {
  estimate: ModeEstimate;
  recommended: boolean;
  reelId: string;
  origin: string;
  destinationLabel: string;
  departureAt: Date;
  accessibility: boolean;
  hasCar: boolean;
  groupSize: GroupSize;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const arrival = new Date(departureAt.getTime() + estimate.durationMin * 60000);
  const tags = reasonTagKeys(estimate.mode, accessibility, hasCar, groupSize);
  const reservationKey = RESERVATION_NOTE_KEY[estimate.mode];

  return (
    <div
      className={`relative rounded-lg border bg-white p-4 ${recommended ? "border-teal-600 md:col-span-2" : "border-gray-200"}`}
    >
      {recommended && (
        <span className="absolute left-0 top-0 rounded-br-lg rounded-tl-lg bg-teal-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
          {t("reelAccessPage.recommendedBadge")}
        </span>
      )}
      <div className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-2 ${recommended ? "mt-3" : ""}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xl">
            {MODE_ICON[estimate.mode]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">{t(MODE_LABEL_KEY[estimate.mode])}</p>
            <p className="truncate text-xs text-gray-400">{destinationLabel}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold tabular-nums text-gray-900">
            {t("accessPlanner.duration", { minutes: estimate.durationMin })}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">
            {estimate.fareYen > 0
              ? t("accessPlanner.fare", { yen: estimate.fareYen.toLocaleString() })
              : t("accessPlanner.fareFree")}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {tags.map((key) => (
          <span key={key} className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {t(key)}
          </span>
        ))}
        {estimate.isReal ? (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
            {t("municipalityProfile.realData")}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {t("municipalityProfile.mockData")}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[11px] font-semibold text-gray-500 underline decoration-gray-300 hover:text-gray-700"
        >
          {expanded ? t("reelAccessPage.expandLess") : t("reelAccessPage.expandMore")}
        </button>
      </div>

      {reservationKey && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-800">{t(reservationKey)}</span>
        </div>
      )}

      {expanded && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
          <p>
            🚉 {t("accessPlanner.departure", { time: formatDateTime(departureAt.toISOString(), i18n.language) })}
            {" · "}🏁 {t("accessPlanner.arrival", { time: formatDateTime(arrival.toISOString(), i18n.language) })}
          </p>
          <p className="mt-1.5 text-gray-400">{t("accessPlanner.fareDisclaimer")}</p>
          <p className="text-gray-400">{t("accessPlanner.noTimetableDisclaimer")}</p>
          <RouteMap reelId={reelId} origin={origin} destinationLabel={destinationLabel} />
        </div>
      )}
    </div>
  );
}

// Redesigned "🧭 アクセス" destination: a full page (not the small popover
// this replaced) that lets a visitor set trip conditions (group size,
// accessibility, own car) and compares train/bus/car/taxi/walk side by side.
// Only one row per search is ever backed by the real Directions API result;
// the rest are consistent, clearly-labeled estimates — see the comment on
// deriveModeEstimates for why the app can't offer 5 real quotes at once.
export default function ReelAccessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const stateReel = (location.state as { reel?: Reel } | null)?.reel;
  const [reel, setReel] = useState<Reel | null>(stateReel ?? null);
  const [notFound, setNotFound] = useState(false);

  const [origin, setOrigin] = useState("");
  const [departureLocal, setDepartureLocal] = useState(nowAsDatetimeLocalValue);
  const [groupSize, setGroupSize] = useState<GroupSize>("couple");
  const [accessibility, setAccessibility] = useState(false);
  const [hasCar, setHasCar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<ModeEstimate[] | null>(null);
  const [departureAt, setDepartureAt] = useState<Date | null>(null);

  useEffect(() => {
    if (stateReel || !id) return;
    api
      .get(`/reels/${id}`)
      .then(({ data }) => setReel(data))
      .catch(() => setNotFound(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!origin.trim() || !reel) return;
    setLoading(true);
    setError(null);
    setEstimates(null);
    try {
      const { data } = await api.get<TransitSuggestion>(`/reels/${reel.id}/access-plan`, {
        params: { origin: origin.trim(), datetime: localDateTimeToIso(departureLocal) },
      });
      setEstimates(deriveModeEstimates(origin.trim(), reel.locationName || reel.municipality.name, data));
      setDepartureAt(new Date(data.departureAt));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("accessPlanner.genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-gray-500">{t("accessPlanner.genericError")}</div>;
  }
  if (!reel) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-gray-400">…</div>;
  }

  const recommendedMode = pickRecommendedMode(accessibility, hasCar, groupSize);
  const orderedEstimates = estimates
    ? [...estimates].sort((a, b) => (a.mode === recommendedMode ? -1 : b.mode === recommendedMode ? 1 : 0))
    : null;

  return (
    <div className="mx-auto max-w-lg p-4 lg:max-w-3xl lg:p-8">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-gray-500 hover:text-gray-700">
        ← {t("reelAccessPage.back")}
      </button>

      <div className="relative mb-4 h-40 overflow-hidden rounded-lg bg-gray-900 lg:h-56">
        <AutoplayVideo src={reel.videoUrl} className="h-full w-full object-cover opacity-90" />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-3 lg:p-5">
          <span className="mb-1 self-start rounded bg-white/90 px-2 py-0.5 text-[10px] font-bold text-gray-800">
            {t(`category.${reel.category}`)}
          </span>
          <p className="text-base font-bold text-white drop-shadow lg:text-xl">
            {reel.locationName || reel.municipality.name}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2 border-b border-gray-200 pb-3">
        <h1 className="text-lg font-bold text-gray-900">{t("reelAccessPage.heading")}</h1>
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
          {t("reelAccessPage.basis")}
        </span>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 lg:p-5">
        <p className="text-sm font-bold text-gray-900">{t("reelAccessPage.conditionsHeading")}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t("reelAccessPage.conditionsSub")}</p>

        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-semibold text-gray-500">{t("reelAccessPage.groupSizeLabel")}</span>
          <GroupSizeToggle value={groupSize} onChange={setGroupSize} />
        </div>

        <form onSubmit={search} className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
          <div className="flex min-w-0 flex-col gap-1 lg:flex-1 lg:basis-48">
            <span className="text-xs font-semibold text-gray-500">{t("accessPlanner.heading")}</span>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder={t("accessPlanner.originPlaceholder")}
              className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">{t("reelAccessPage.departureLabel")}</span>
            <input
              type="datetime-local"
              value={departureLocal}
              onChange={(e) => setDepartureLocal(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !origin.trim()}
            className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? t("accessPlanner.searching") : t("accessPlanner.search")}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
          <Switch active={accessibility} onToggle={() => setAccessibility((v) => !v)} label={t("reelAccessPage.accessibilityToggle")} />
          <Switch active={hasCar} onToggle={() => setHasCar((v) => !v)} label={t("reelAccessPage.hasCarToggle")} />
        </div>
      </div>

      {error && <p className="mb-4 text-xs text-red-500">{error}</p>}

      {orderedEstimates && departureAt && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {orderedEstimates.map((estimate) => (
            <ModeCard
              key={estimate.mode}
              estimate={estimate}
              recommended={estimate.mode === recommendedMode}
              reelId={reel.id}
              origin={origin.trim()}
              destinationLabel={reel.locationName || reel.municipality.name}
              departureAt={departureAt}
              accessibility={accessibility}
              hasCar={hasCar}
              groupSize={groupSize}
            />
          ))}
          <p className="px-1 text-[11px] leading-relaxed text-gray-400 md:col-span-2">
            {t("reelAccessPage.estimateDisclaimer")}
          </p>
        </div>
      )}

      <p className="mt-5 text-center text-xs text-gray-400">
        <Link to={`/municipalities/${reel.municipality.id}`} className="hover:underline">
          {reel.municipality.name}
        </Link>
      </p>
    </div>
  );
}
