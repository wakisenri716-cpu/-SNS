import { useTranslation } from "react-i18next";
import { Flower2 } from "lucide-react";
import { formatBestMonths, isInSeason } from "../lib/season";

// Toggle chips for the 12 months (uploader / post editor).
export function BestMonthsPicker({ value, onChange }: { value: number[]; onChange: (months: number[]) => void }) {
  const { i18n } = useTranslation();
  const name = (m: number) => new Intl.DateTimeFormat(i18n.language, { month: "short", timeZone: "UTC" }).format(Date.UTC(2026, m - 1, 15));
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const on = value.includes(m);
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== m) : [...value, m].sort((a, b) => a - b))}
            className={`rounded-full py-1 text-xs font-medium ${on ? "bg-jz-red text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {name(m)}
          </button>
        );
      })}
    </div>
  );
}

// "今が見頃" when this month is one of the poster's 見頃 months, otherwise
// "見頃 5月–6月" — or nothing if the poster didn't say. `dark` is for use over video.
export function SeasonBadge({ months, dark = false }: { months: number[]; dark?: boolean }) {
  const { t, i18n } = useTranslation();
  if (months.length === 0) return null;
  const now = isInSeason(months);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        now
          ? "bg-jz-red text-white"
          : dark
            ? "bg-white/15 text-white ring-1 ring-white/30"
            : "text-gray-700 ring-1 ring-gray-300"
      }`}
    >
      <Flower2 className="h-3 w-3" aria-hidden />
      {now ? t("season.now") : t("season.months", { months: formatBestMonths(months, i18n.language) })}
    </span>
  );
}
