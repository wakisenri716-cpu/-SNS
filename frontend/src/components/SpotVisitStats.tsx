import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Footprints } from "lucide-react";
import { api } from "../api/client";

// "今日3人がここでスタンプを押しました": real check-ins at this spot
// (GET /reels/:id/visits), shown only once someone has been.
export default function SpotVisitStats({ reelId }: { reelId: string }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ today: number; total: number } | null>(null);

  useEffect(() => {
    api
      .get<{ today: number; total: number }>(`/reels/${reelId}/visits`)
      .then(({ data }) => setStats(data))
      .catch(() => setStats(null));
  }, [reelId]);

  if (!stats || stats.total === 0) return null;
  return (
    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-jz-ink">
      <Footprints className="h-4 w-4 text-jz-red" />
      {stats.today > 0 ? t("visitStats.today", { count: stats.today }) : t("visitStats.total", { count: stats.total })}
    </p>
  );
}
