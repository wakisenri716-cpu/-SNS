import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Submission } from "../types";
import StatusBadge from "./SubmissionStatusBadge";

// 提供した写真・動画: what this traveler offered to municipalities and where
// each one stands — waiting, approved (with the points it earned), posted
// (with a link), or passed on (with the municipality's reason).
export default function MySubmissions() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Submission[] | null>(null);

  useEffect(() => {
    api
      .get<{ items: Submission[] }>("/submissions/mine")
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]));
  }, []);

  async function withdraw(s: Submission) {
    if (!window.confirm(t("submissions.withdrawConfirm"))) return;
    await api.delete(`/submissions/${s.id}`);
    setItems((list) => list?.filter((x) => x.id !== s.id) ?? null);
  }

  if (!items || items.length === 0) return null;
  const earned = items.reduce((sum, s) => sum + s.points, 0);
  return (
    <section className="mt-7" aria-label={t("submissions.mineHeading")}>
      <h2 className="flex items-baseline gap-2 text-base font-bold text-jz-ink">
        {t("submissions.mineHeading")}
        <span className="text-xs font-normal text-gray-500">{t("submissions.earned", { points: earned })}</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((s) => (
          <li key={s.id} className="flex gap-3 rounded-2xl border border-gray-200 p-2.5">
            <span className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              {s.kind === "video" ? (
                <video src={`${s.fileUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                <img src={s.fileUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1 text-xs">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-jz-ink">{s.municipality?.name}</span>
                <StatusBadge s={s} />
              </p>
              {s.description && <p className="mt-0.5 line-clamp-2 text-gray-600">{s.description}</p>}
              <p className="mt-0.5 text-[11px] text-gray-500">{new Date(s.createdAt).toLocaleDateString(i18n.language)}</p>
              {s.status === "rejected" && s.reviewNote && <p className="mt-1 rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-600">{t("submissions.reason", { note: s.reviewNote })}</p>}
              <div className="mt-1.5 flex gap-2">
                {s.reelId && (
                  <Link to={`/reels/${s.reelId}/access`} className="text-[11px] font-bold text-jz-accent">
                    {t("submissions.viewPost")}
                  </Link>
                )}
                {s.status === "pending" && (
                  <button type="button" onClick={() => void withdraw(s)} className="text-[11px] font-semibold text-gray-500 hover:text-jz-warm-text">
                    {t("submissions.withdraw")}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
