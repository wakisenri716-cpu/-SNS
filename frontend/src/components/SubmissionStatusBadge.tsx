import { useTranslation } from "react-i18next";
import type { Submission } from "../types";

// Where a 提供された素材 stands: waiting, approved (+points), posted, passed on.
export default function StatusBadge({ s }: { s: Pick<Submission, "status" | "reelId" | "points"> }) {
  const { t } = useTranslation();
  const [cls, label] = s.reelId
    ? ["bg-jz-accent text-white", t("submissions.status.posted")]
    : s.status === "approved"
      ? ["bg-jz-tint text-jz-accent", t("submissions.status.approved", { points: s.points })]
      : s.status === "rejected"
        ? ["bg-gray-100 text-gray-600", t("submissions.status.rejected")]
        : ["bg-amber-50 text-amber-800", t("submissions.status.pending")];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}
