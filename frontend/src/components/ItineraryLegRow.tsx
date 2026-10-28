import { useTranslation } from "react-i18next";
import { TRANSIT_MODE_LABEL_KEY } from "../lib/transitModeLabels";
import type { TransitSuggestion } from "../types";
import ModeIcon from "./ModeIcon";

// A leg can be several sub-legs (e.g. walk 10分 + train 83分); label it by
// the one that takes longest, not just the first.
function mainMode(leg: TransitSuggestion) {
  return leg.legs.reduce((a, b) => (b.durationMin > a.durationMin ? b : a), leg.legs[0])?.mode;
}

// The travel between two しおり stops: main mode and total time.
export default function ItineraryLegRow({ leg, className = "my-1.5 ml-9" }: { leg: TransitSuggestion; className?: string }) {
  const { t } = useTranslation();
  const mode = mainMode(leg);
  return (
    <p className={`${className} flex flex-wrap items-center gap-1 text-xs text-gray-600`}>
      <ModeIcon mode={mode} className="h-3.5 w-3.5" />
      <span>
        {t("itinerary.legSummary", {
          mode: t(TRANSIT_MODE_LABEL_KEY[mode ?? ""] ?? "accessPlanner.modeDrive"),
          duration: t("accessPlanner.duration", { minutes: leg.totalDurationMin }),
        })}
      </span>
      {leg.isMock && (
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
          {t("municipalityProfile.mockData")}
        </span>
      )}
    </p>
  );
}
