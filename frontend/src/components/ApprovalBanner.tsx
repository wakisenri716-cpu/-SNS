import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Hourglass, RefreshCw, XCircle } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../types";

// 登録の承認: on a municipality's or business's dashboard while the operator
// hasn't approved the account yet (posting and editing wait), or refused it.
export default function ApprovalBanner() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [checking, setChecking] = useState(false);
  if (!user || !user.approval || user.approval === "approved") return null;
  const rejected = user.approval === "rejected";

  async function check() {
    setChecking(true);
    try {
      const { data } = await api.get<{ user: AuthUser }>("/auth/me");
      updateUser(data.user);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={`mb-4 rounded-2xl p-4 text-sm ${rejected ? "bg-orange-50 text-jz-warm-text" : "bg-jz-tint text-jz-ink"}`} role="status">
      <p className="flex items-center gap-2 font-bold">
        {rejected ? <XCircle className="h-5 w-5 shrink-0" /> : <Hourglass className="h-5 w-5 shrink-0 text-jz-accent" />}
        {t(rejected ? "approval.rejectedTitle" : "approval.pendingTitle")}
      </p>
      <p className="mt-1 text-xs leading-relaxed">{t(rejected ? "approval.rejectedBody" : "approval.pendingBody")}</p>
      {rejected && user.approvalNote && <p className="mt-2 rounded-xl bg-white/70 p-2 text-xs">{t("approval.reason", { note: user.approvalNote })}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void check()} disabled={checking} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-jz-ink ring-1 ring-gray-200">
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> {t("approval.check")}
        </button>
        <Link to="/contact" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-jz-ink ring-1 ring-gray-200">
          {t("approval.contact")}
        </Link>
      </div>
    </div>
  );
}
