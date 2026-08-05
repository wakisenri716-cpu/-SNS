import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import AccessPlannerForm from "../components/AccessPlannerForm";
import type { Reel } from "../types";

// Dedicated page for a single reel's access info, reached via the "🧭 アクセス"
// button in the fullscreen reel viewer — replaces the inline popover that used
// to open on top of the video, so results have room to breathe and the URL is
// shareable/bookmarkable. GET /reels/:id/access-plan does the actual lookup
// (see AccessPlannerForm); this page just supplies the destination context.
export default function ReelAccessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // The viewer already has the full reel object in memory when the user
  // clicks the button, so it's passed via navigation state to avoid an extra
  // fetch (and the view-count bump GET /reels/:id causes). Only falls back to
  // fetching when this URL is opened directly, e.g. a shared link or refresh.
  const stateReel = (location.state as { reel?: Reel } | null)?.reel;
  const [reel, setReel] = useState<Reel | null>(stateReel ?? null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (stateReel || !id) return;
    api
      .get(`/reels/${id}`)
      .then(({ data }) => setReel(data))
      .catch(() => setNotFound(true));
    // Intentionally only re-runs if the id changes, not on every stateReel
    // identity change — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (notFound) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-gray-500">{t("accessPlanner.genericError")}</div>;
  }

  if (!reel) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-gray-400">…</div>;
  }

  return (
    <div className="mx-auto max-w-lg p-4 lg:p-6">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-gray-500 hover:text-gray-700">
        ← {t("reelAccessPage.back")}
      </button>

      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700">
          {reel.municipality.avatarUrl ? (
            <img src={reel.municipality.avatarUrl} className="h-full w-full rounded-full object-cover" />
          ) : (
            reel.municipality.name.slice(0, 1)
          )}
        </div>
        <div className="min-w-0">
          <Link
            to={`/municipalities/${reel.municipality.id}`}
            className="truncate text-sm font-semibold text-gray-900 hover:underline"
          >
            {reel.municipality.name}
          </Link>
          <p className="truncate text-xs text-gray-400">{reel.municipality.prefecture}</p>
        </div>
      </div>

      {reel.locationName && <p className="mb-1 text-sm text-gray-900">📍 {reel.locationName}</p>}
      {reel.caption && <p className="mb-5 text-sm text-gray-500">{reel.caption}</p>}

      <h1 className="mb-1 text-sm font-semibold text-gray-600">{t("accessPlanner.heading")}</h1>
      <p className="mb-3 text-xs text-gray-400">{t("reelAccessPage.description")}</p>

      <AccessPlannerForm endpoint={`/reels/${reel.id}/access-plan`} />
    </div>
  );
}
