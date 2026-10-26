import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Municipality } from "../types";

type Tab = "lodgingInfo" | "restaurantInfo";

// Pitch deck (2) 宿・飲食店情報: from one post, lead into the posting
// municipality's own lodging / restaurant write-up and booking-search links —
// the same content as its profile tabs, so travelers don't have to go find it.
export default function MunicipalityStayInfo({ municipalityId }: { municipalityId: string }) {
  const { t } = useTranslation();
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [tab, setTab] = useState<Tab>("lodgingInfo");

  useEffect(() => {
    let cancelled = false;
    api
      .get<Municipality>(`/municipalities/${municipalityId}`)
      .then(({ data }) => !cancelled && setMunicipality(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  if (!municipality) return null;
  const text = municipality[tab];

  return (
    <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white shadow-sm p-4 lg:p-5">
      <h2 className="text-sm font-bold text-gray-900">🏨 {t("stayInfo.heading", { name: municipality.name })}</h2>
      <div className="mt-3 flex gap-1.5">
        {(["lodgingInfo", "restaurantInfo"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              tab === key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t(key === "lodgingInfo" ? "dashboard.tabLodging" : "dashboard.tabRestaurant")}
          </button>
        ))}
      </div>
      <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
        {text || t("municipalityProfile.noInfo")}
      </p>
      <Link to={`/municipalities/${municipality.id}`} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
        {t("stayInfo.profileLink", { name: municipality.name })}
      </Link>

      {tab === "lodgingInfo" && municipality.otaLinks.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">{t("municipalityProfile.otaHeading")}</p>
          <div className="flex flex-wrap gap-2">
            {municipality.otaLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-800 hover:border-brand-300 hover:bg-brand-50"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{t("stayInfo.otaNote")}</p>
        </div>
      )}
    </div>
  );
}
