import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { TravelerTagPicker } from "./TravelerTagChips";
import { BestMonthsPicker } from "./BestMonths";
import { REEL_CATEGORIES, type Reel, type ReelCategory, type TravelerTag } from "../types";

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400";

// Modal for editing an existing post's text, category, place and tags
// (PUT /reels/:id). The video itself can't be replaced — delete and repost.
export default function ReelEditor({
  reel,
  onClose,
  onSaved,
}: {
  reel: Reel;
  onClose: () => void;
  onSaved: (reel: Reel) => void;
}) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(reel.caption);
  const [category, setCategory] = useState<ReelCategory>(reel.category);
  const [locationName, setLocationName] = useState(reel.locationName ?? "");
  const [lat, setLat] = useState(reel.locationLat?.toString() ?? "");
  const [lng, setLng] = useState(reel.locationLng?.toString() ?? "");
  const [tags, setTags] = useState<TravelerTag[]>(reel.travelerTags);
  const [bestMonths, setBestMonths] = useState<number[]>(reel.bestMonths ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const latNum = lat.trim() === "" ? null : Number(lat);
    const lngNum = lng.trim() === "" ? null : Number(lng);
    if ((latNum === null) !== (lngNum === null) || Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setError(t("reelEditor.coordsError"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put<Reel>(`/reels/${reel.id}`, {
        caption,
        category,
        locationName,
        locationLat: latNum,
        locationLng: lngNum,
        travelerTags: tags,
        bestMonths,
      });
      onSaved(data);
      onClose();
    } catch {
      setError(t("reelEditor.saveError"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={save}
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-gray-900">{t("reelEditor.heading")}</h3>
        <label className="text-xs font-medium text-gray-500">
          {t("reelEditor.captionLabel")}
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-xs font-medium text-gray-500">
          {t("reelUploader.categoryLabel")}
          <select value={category} onChange={(e) => setCategory(e.target.value as ReelCategory)} className={`mt-1 ${inputClass}`}>
            {REEL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs font-medium text-gray-500">
          {t("reelEditor.locationLabel")}
          <input
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder={t("reelUploader.locationNamePlaceholder")}
            className={`mt-1 ${inputClass}`}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder={t("reelUploader.latPlaceholder")} inputMode="decimal" className={inputClass} />
            <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder={t("reelUploader.lngPlaceholder")} inputMode="decimal" className={inputClass} />
          </div>
          <p className="mt-1 text-[11px] font-normal leading-relaxed text-gray-500">{t("reelEditor.coordsNote")}</p>
        </div>
        <div className="text-xs font-medium text-gray-500">
          {t("reelUploader.travelerTagsLabel")}
          <div className="mt-1">
            <TravelerTagPicker value={tags} onChange={setTags} />
          </div>
          <p className="mt-1 text-[11px] font-normal leading-relaxed text-gray-500">{t("reelEditor.tagsNote")}</p>
        </div>
        <div className="text-xs font-medium text-gray-500">
          {t("season.pickerLabel")}
          <div className="mt-1">
            <BestMonthsPicker value={bestMonths} onChange={setBestMonths} />
          </div>
        </div>
        {error && <p className="text-xs text-jz-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
            {t("dashboard.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {t("reelEditor.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
