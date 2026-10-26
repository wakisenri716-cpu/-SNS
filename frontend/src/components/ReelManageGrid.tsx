import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import ReelEditor from "./ReelEditor";
import { TravelerTagChips } from "./TravelerTagChips";
import type { Reel } from "../types";
import { Pencil } from "lucide-react";

export default function ReelManageGrid({
  reels,
  onRemoved,
  onUpdated,
}: {
  reels: Reel[];
  onRemoved: (id: string) => void;
  onUpdated: (reel: Reel) => void;
}) {
  const { t } = useTranslation();
  const [editingReel, setEditingReel] = useState<Reel | null>(null);

  async function removeReel(id: string) {
    if (!window.confirm(t("reelEditor.deleteConfirm"))) return;
    await api.delete(`/reels/${id}`);
    onRemoved(id);
  }

  if (reels.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
        {t("reelManageGrid.empty")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {editingReel && (
        <ReelEditor reel={editingReel} onClose={() => setEditingReel(null)} onSaved={onUpdated} />
      )}
      {reels.map((reel) => (
        <div key={reel.id} className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
          <video src={reel.videoUrl} className="aspect-video w-full bg-gray-200 object-cover" muted />
          <div className="flex items-center gap-2 p-2">
            <p className="flex-1 truncate text-xs text-gray-700">{reel.caption || t("reelManageGrid.untitled")}</p>
            <button
              onClick={() => setEditingReel(reel)}
              title={t("reelEditor.heading")}
              aria-label={t("reelEditor.heading")}
              className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => removeReel(reel.id)}
              className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              {t("reelManageGrid.delete")}
            </button>
          </div>
          {reel.travelerTags.length > 0 && (
            <div className="px-2 pb-2">
              <TravelerTagChips tags={reel.travelerTags} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
