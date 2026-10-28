import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flag } from "lucide-react";
import { api } from "../api/client";

interface ReportedComment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  reel: { id: string; title: string };
  reportCount: number;
  reasons: Record<string, number>;
}

// Dashboard: comments people reported on this account's posts. Delete them,
// or keep them (clears the reports and un-hides). Hidden from the dashboard
// when there's nothing to review.
export default function ReportedComments() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReportedComment[]>([]);
  const [threshold, setThreshold] = useState(3);

  useEffect(() => {
    api.get<{ items: ReportedComment[]; hideThreshold: number }>("/reels/mine/reported-comments").then(({ data }) => {
      setItems(data.items);
      setThreshold(data.hideThreshold);
    });
  }, []);

  if (items.length === 0) return null;

  async function act(c: ReportedComment, action: "delete" | "keep") {
    if (action === "delete" && !window.confirm(t("comments.deleteConfirm"))) return;
    await api.delete(action === "delete" ? `/reels/${c.reel.id}/comments/${c.id}` : `/reels/${c.reel.id}/comments/${c.id}/reports`);
    setItems((prev) => prev.filter((x) => x.id !== c.id));
  }

  return (
    <section className="border-b border-gray-200 bg-jz-tint/40 p-4 lg:p-6">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-jz-red">
        <Flag className="h-4 w-4" /> {t("moderation.heading", { count: items.length })}
      </h3>
      <p className="mt-1 text-xs text-gray-500">{t("moderation.note", { count: threshold })}</p>
      <ul className="mt-3 flex flex-col gap-2 lg:max-w-2xl">
        {items.map((c) => (
          <li key={c.id} className="rounded-2xl border border-gray-200 bg-white p-3">
            <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{c.body}</p>
            <p className="mt-1.5 text-[11px] text-gray-500">
              {c.authorName}・
              <Link to={`/reels/${c.reel.id}/access`} className="hover:underline">
                {c.reel.title}
              </Link>
              ・{t("moderation.reportCount", { count: c.reportCount })}（
              {Object.entries(c.reasons)
                .map(([reason, n]) => `${t(`comments.reason.${reason}`)} ${n}`)
                .join("・")}
              ）{c.reportCount >= threshold && <span className="ml-1 font-semibold text-jz-red">{t("comments.hiddenBadge")}</span>}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void act(c, "delete")} className="rounded-full bg-jz-red px-3 py-1.5 text-xs font-bold text-white">
                {t("moderation.delete")}
              </button>
              <button type="button" onClick={() => void act(c, "keep")} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                {t("moderation.keep")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
