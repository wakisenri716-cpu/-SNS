import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Reel } from "../types";

export default function ReelManageGrid({
  reels,
  onRemoved,
}: {
  reels: Reel[];
  onRemoved: (id: string) => void;
}) {
  const { t } = useTranslation();

  async function removeReel(id: string) {
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
      {reels.map((reel) => (
        <div key={reel.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <video src={reel.videoUrl} className="aspect-video w-full bg-gray-200 object-cover" muted />
          <div className="flex items-center gap-2 p-2">
            <p className="flex-1 truncate text-xs text-gray-700">{reel.caption || t("reelManageGrid.untitled")}</p>
            <button
              onClick={() => removeReel(reel.id)}
              className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              {t("reelManageGrid.delete")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
