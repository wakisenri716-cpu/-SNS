import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ReelUploader from "../components/ReelUploader";
import ReelManageGrid from "../components/ReelManageGrid";
import type { Reel } from "../types";

export default function CompanyDashboardPage() {
  const { company } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);

  useEffect(() => {
    if (!company) return;
    api.get("/reels/mine").then(({ data }: { data: { items: Reel[] } }) => setReels(data.items));
  }, [company?.id]);

  if (!company) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <section>
        <h2 className="mb-1 text-lg font-bold text-gray-900">{company.name} 管理画面</h2>
        <p className="mb-3 text-sm text-gray-500">
          {company.municipality.name}（{company.municipality.prefecture}）名義でリールを投稿します。
        </p>
        <ReelUploader onCreated={(reel) => setReels((prev) => [reel, ...prev])} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">投稿済みリール（{reels.length}件）</h3>
        <p className="mb-2 text-xs text-gray-400">
          自社で投稿したリールのみ表示・削除できます。自治体プロフィールの編集は自治体アカウントのみ可能です。
        </p>
        <ReelManageGrid reels={reels} onRemoved={(id) => setReels((prev) => prev.filter((r) => r.id !== id))} />
      </section>
    </div>
  );
}
