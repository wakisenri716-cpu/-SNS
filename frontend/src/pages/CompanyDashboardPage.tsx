import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import ReelManageGrid from "../components/ReelManageGrid";
import type { Reel } from "../types";

export default function CompanyDashboardPage() {
  const { company } = useAuth();
  const { t } = useTranslation();
  const [reels, setReels] = useState<Reel[]>([]);

  useEffect(() => {
    if (!company) return;
    api.get("/reels/mine").then(({ data }: { data: { items: Reel[] } }) => setReels(data.items));
  }, [company?.id]);

  if (!company) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <section>
        <h2 className="mb-1 text-lg font-bold text-gray-900">
          {t("companyDashboard.manageScreen", { name: company.name })}
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          {t("companyDashboard.postingAs", {
            municipality: company.municipality.name,
            prefecture: company.municipality.prefecture,
          })}
        </p>
        <ReelUploader onCreated={(reel) => setReels((prev) => [reel, ...prev])} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">
          {t("companyDashboard.postedHeading", { count: reels.length })}
        </h3>
        <p className="mb-2 text-xs text-gray-400">{t("companyDashboard.note")}</p>
        <ReelManageGrid reels={reels} onRemoved={(id) => setReels((prev) => prev.filter((r) => r.id !== id))} />
      </section>
    </div>
  );
}
