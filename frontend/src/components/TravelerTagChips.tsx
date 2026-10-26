import { useTranslation } from "react-i18next";
import { TRAVELER_TAGS, type TravelerTag } from "../types";

// Read-only chips showing who a post's spot suits. `dark` is for use over video.
export function TravelerTagChips({ tags, dark = false }: { tags: TravelerTag[]; dark?: boolean }) {
  const { t } = useTranslation();
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            dark ? "bg-white/15 text-white ring-1 ring-white/30" : "text-gray-700 ring-1 ring-gray-300"
          }`}
        >
          {t(`travelerTag.${tag}`)}
        </span>
      ))}
    </div>
  );
}

// Toggle chips for choosing tags (uploader / post editor).
export function TravelerTagPicker({
  value,
  onChange,
}: {
  value: TravelerTag[];
  onChange: (tags: TravelerTag[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {TRAVELER_TAGS.map((tag) => {
        const on = value.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== tag) : TRAVELER_TAGS.filter((v) => v === tag || value.includes(v)))}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              on ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t(`travelerTag.${tag}`)}
          </button>
        );
      })}
    </div>
  );
}
