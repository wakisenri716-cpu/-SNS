import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPinCheck } from "lucide-react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { currentPosition, formatDistance } from "../lib/geo";
import { showToast } from "../lib/toast";
import Stamp from "./Stamp";
import { formatStampDate } from "../lib/stampDate";

// スタンプラリー on a spot's access page: when you're actually there (within
// 1km), press to get its stamp (+20pt). Travelers only.
export default function VisitStampCard({ reelId, place }: { reelId: string; place: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [visitedAt, setVisitedAt] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "USER") return;
    api
      .get<{ items: { visitedAt: string; reel: { id: string } }[] }>("/auth/me/stamps")
      .then(({ data }) => setVisitedAt(data.items.find((v) => v.reel.id === reelId)?.visitedAt ?? null))
      .catch(() => {});
  }, [reelId, user?.role]);

  if (user?.role !== "USER") return null;

  async function checkIn() {
    setBusy(true);
    setMessage(null);
    try {
      const here = await currentPosition().catch(() => null);
      if (!here) {
        setMessage(t("stamps.noLocation"));
        return;
      }
      const { data } = await api.post<{ visitedAt: string; points: number }>(`/reels/${reelId}/visit`, here);
      setVisitedAt(data.visitedAt);
      setFresh(true);
      navigator.vibrate?.([12, 40, 12]);
      showToast(t("stamps.got", { points: data.points }), { label: t("stamps.viewBook"), to: "/mypage" });
    } catch (err) {
      const distance = isAxiosError(err) ? (err.response?.data as { distanceMeters?: number } | undefined)?.distanceMeters : undefined;
      setMessage(distance != null ? t("stamps.tooFar", { distance: formatDistance(distance / 1000) }) : t("stamps.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex items-center gap-4 overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-4">
      {visitedAt ? (
        <Stamp place={place} date={formatStampDate(visitedAt)} size={92} fresh={fresh} />
      ) : (
        <span className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-300">
          <MapPinCheck className="h-8 w-8" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900">{t("stamps.heading")}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{visitedAt ? t("stamps.collected") : t("stamps.how")}</p>
        {!visitedAt && (
          <button
            type="button"
            onClick={() => void checkIn()}
            disabled={busy}
            className="mt-2.5 rounded-full bg-jz-red px-4 py-2 text-xs font-bold text-white active:scale-95 disabled:opacity-60"
          >
            {busy ? t("stamps.checking") : t("stamps.checkIn")}
          </button>
        )}
        {message && <p className="mt-2 text-xs text-jz-red">{message}</p>}
      </div>
    </div>
  );
}
