import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { TravelerTagPicker } from "./TravelerTagChips";
import type { Reel, TravelerTag } from "../types";

// Modal for changing an existing post's 対応・おすすめ相手 tags (PUT /reels/:id).
export default function ReelTagEditor({
  reel,
  onClose,
  onSaved,
}: {
  reel: Reel;
  onClose: () => void;
  onSaved: (reel: Reel) => void;
}) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TravelerTag[]>(reel.travelerTags);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put<Reel>(`/reels/${reel.id}`, { travelerTags: tags });
      onSaved(data);
      onClose();
    } catch {
      setError(t("reelTagEditor.saveError"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-gray-900">{t("reelTagEditor.heading")}</h3>
        <p className="mt-0.5 truncate text-xs text-gray-400">{reel.locationName || reel.caption}</p>
        <div className="mt-4">
          <TravelerTagPicker value={tags} onChange={setTags} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">{t("reelTagEditor.note")}</p>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {t("dashboard.cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {t("reelTagEditor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
