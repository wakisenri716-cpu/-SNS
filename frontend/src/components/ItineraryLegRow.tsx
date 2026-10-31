import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";
import { TRANSIT_MODE_LABEL_KEY } from "../lib/transitModeLabels";
import { googleTransitUrl, yahooTransitUrl } from "../lib/transitLinks";
import { clock } from "../lib/transportDisplay";
import { RIDE_MODES, optionMinutes } from "../lib/legOptions";
import type { LegOption, TransitSuggestion, TripTransport } from "../types";
import { useDuration } from "../lib/useDuration";
import ModeIcon from "./ModeIcon";

// A leg can be several sub-legs (e.g. walk 10分 + train 83分); label it by
// the one that takes longest, not just the first.
function mainMode(leg: TransitSuggestion) {
  return leg.legs.reduce(
    (a, b) => (b.durationMin > a.durationMin ? b : a),
    leg.legs[0],
  )?.mode;
}

type Place = { name: string; lat?: number | null; lng?: number | null };

// The travel between two しおり stops: main mode and total time, and — for
// anything longer than a walk — links to the real timetables (Google Maps by
// public transport, Yahoo!乗換案内) with both places filled in. When a way
// for the leg was chosen (区間の行き方), it's shown instead of the estimate.
// 乗る便 entered on their own that belong to this leg (`saved`) show under it.
export default function ItineraryLegRow({
  leg,
  from,
  to,
  className = "my-1.5 ml-9",
  saved = [],
  chosen = null,
  hint = null,
}: {
  leg: TransitSuggestion;
  from?: Place;
  to?: Place;
  className?: string;
  saved?: TripTransport[];
  chosen?: LegOption | null;
  /** How the chosen way's first ride fits the planned departure. */
  hint?: { early: boolean; text: string } | null;
}) {
  const { t, i18n } = useTranslation();
  const duration = useDuration();
  const estimated = mainMode(leg);
  const chosenMin = chosen ? optionMinutes(chosen) : null;
  const mode = chosen ? chosen.mode : estimated;
  const origin = from ?? { name: leg.originLabel };
  const destination = to ?? { name: leg.destinationLabel };
  const showLinks = chosen ? RIDE_MODES.includes(chosen.mode) : mode !== "walk";
  return (
    <div className={className}>
      <p className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
        <ModeIcon mode={mode} className="h-3.5 w-3.5" />
        {chosen ? (
          <span className="font-semibold text-jz-ink">
            {chosenMin != null
              ? t("legOption.chosenSummary", { mode: t(`legOption.mode.${chosen.mode}`), duration: duration(chosenMin) })
              : t("legOption.chosenNoTime", { mode: t(`legOption.mode.${chosen.mode}`), duration: duration(leg.totalDurationMin) })}
            {chosen.title && <span className="ml-1 font-normal text-gray-500">{chosen.title}</span>}
          </span>
        ) : (
          <span>
            {t("itinerary.legSummary", {
              mode: t(TRANSIT_MODE_LABEL_KEY[mode ?? ""] ?? "accessPlanner.modeDrive"),
              duration: t("accessPlanner.duration", { minutes: leg.totalDurationMin }),
            })}
          </span>
        )}
        {!chosen && leg.isMock && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            {t("municipalityProfile.mockData")}
          </span>
        )}
      </p>
      {hint && <p className={`mt-0.5 text-[11px] font-semibold ${hint.early ? "text-amber-700" : "text-gray-500"}`}>{hint.text}</p>}
      {showLinks && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-gray-500">{t("transit.timetable")}</span>
          <a
            href={googleTransitUrl(origin, destination)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-jz-ink hover:bg-gray-200"
          >
            {t("transit.googleMaps")} <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={yahooTransitUrl(origin.name, destination.name)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-jz-ink hover:bg-gray-200"
          >
            {t("transit.yahoo")} <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      )}
      {saved.map((tr) => (
        <p key={tr.id} className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
          <Check className="h-3 w-3 shrink-0" />
          <span className="truncate tabular-nums">
            {t("transit.savedRide", { depart: clock(tr.departAt, i18n.language), arrive: clock(tr.arriveAt, i18n.language), name: tr.name })}
          </span>
        </p>
      ))}
    </div>
  );
}

// "2日目" between the stops of a multi-day しおり.
export function DayDivider({ day }: { day: number }) {
  const { t } = useTranslation();
  return (
    <p className="mb-1 mt-4 flex items-center gap-2 text-[11px] font-bold tracking-wide text-jz-red first:mt-0">
      <span className="flex w-7 justify-center">
        <span className="h-1.5 w-1.5 rounded-full bg-jz-red" />
      </span>
      {t("itinerary.dayLabel", { day: day + 1 })}
      <span className="h-px flex-1 bg-gray-200" />
    </p>
  );
}
