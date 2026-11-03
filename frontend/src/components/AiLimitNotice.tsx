import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Gem, Ticket } from "lucide-react";

// Shown where an AI request was refused because the free uses are gone: how
// to go on — AIチケット for points, a paid plan, or signing in.
export default function AiLimitNotice({ signedIn, plan = null, className = "" }: { signedIn: boolean; plan?: string | null; className?: string }) {
  const { t } = useTranslation();
  const chip = "mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold";
  return (
    <div className={`rounded-2xl bg-jz-tint p-3 text-xs leading-relaxed text-jz-ink ${className}`} role="status">
      <p className="font-semibold">{t(!signedIn ? "aiLimit.visitor" : plan ? "aiLimit.planUsed" : "aiLimit.signedIn")}</p>
      <div className="flex flex-wrap gap-1.5">
        <Link to={signedIn ? "/points?tab=ai" : "/login"} className={`${chip} bg-jz-accent text-white`}>
          <Ticket className="h-3.5 w-3.5" /> {t(signedIn ? "aiLimit.getTickets" : "aiLimit.login")}
        </Link>
        {signedIn && !plan && (
          <Link to="/plans" className={`${chip} bg-jz-ink text-white`}>
            <Gem className="h-3.5 w-3.5" /> {t("aiLimit.upgrade")}
          </Link>
        )}
      </div>
    </div>
  );
}
