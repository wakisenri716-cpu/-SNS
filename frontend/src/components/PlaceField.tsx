import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, MapPinned } from "lucide-react";

const PlacePickerSheet = lazy(() => import("./PlacePickerSheet"));

export interface PlaceValue {
  name: string;
  lat: number | null;
  lng: number | null;
}

// A post's place: its name, and — picked by search or on the map (場所を選ぶ)
// — its position, which puts the post on the map, in アクセス and in しおり.
export default function PlaceField({
  value,
  onChange,
  municipalityId,
  label,
  placeholder,
  inputClassName,
}: {
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  /** Start the picker near this town (else the poster's own). */
  municipalityId?: string;
  label?: string;
  placeholder?: string;
  inputClassName: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const located = value.lat != null && value.lng != null;
  return (
    <div className="text-xs font-medium text-gray-500">
      {label ?? t("place.fieldLabel")}
      <div className="mt-1 flex gap-2">
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={200}
          placeholder={placeholder ?? t("reelUploader.locationNamePlaceholder")}
          aria-label={label ?? t("place.fieldLabel")}
          className={`min-w-0 flex-1 ${inputClassName}`}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-jz-tint px-3 text-xs font-bold text-jz-accent hover:bg-jz-accent/15"
        >
          <MapPinned className="h-4 w-4" />
          {t("place.open")}
        </button>
      </div>
      <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-normal ${located ? "text-jz-accent" : "text-gray-500"}`}>
        <MapPin className="h-3 w-3" />
        {located ? t("place.hasCoords") : t("place.noCoords")}
        {located && (
          <button type="button" onClick={() => onChange({ ...value, lat: null, lng: null })} className="font-semibold text-gray-500 underline hover:text-jz-ink">
            {t("place.clear")}
          </button>
        )}
      </p>
      {open && (
        <Suspense fallback={null}>
          <PlacePickerSheet
            initial={value}
            municipalityId={municipalityId}
            onClose={() => setOpen(false)}
            onPick={(p) => {
              onChange({ name: p.name, lat: p.lat, lng: p.lng });
              setOpen(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
