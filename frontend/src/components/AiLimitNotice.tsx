import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ticket } from "lucide-react";

// Shown where an AI request was refused because today's free uses are gone:
// how to go on — AIチケット for points, or signing in for more free uses.
export default function AiLimitNotice({ signedIn, className = "" }: { signedIn: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-2xl bg-jz-tint p-3 text-xs leading-relaxed text-jz-ink ${className}`} role="status">
      <p className="font-semibold">{t(signedIn ? "aiLimit.signedIn" : "aiLimit.visitor")}</p>
      <Link
        to={signedIn ? "/points" : "/login"}
        className="mt-2 inline-flex items-center gap-1 rounded-full bg-jz-accent px-3 py-1.5 text-[11px] font-bold text-white"
      >
        <Ticket className="h-3.5 w-3.5" /> {t(signedIn ? "aiLimit.getTickets" : "aiLimit.login")}
      </Link>
    </div>
  );
}
