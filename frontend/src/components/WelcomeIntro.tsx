import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { X } from "lucide-react";

const DISMISSED_KEY = "jaziba-welcome-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// One-line "what is this site" for logged-out first-time visitors, with the
// two sign-up paths (traveler / municipality). Closing it is remembered on
// this device only.
export default function WelcomeIntro() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (user || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable (private mode etc.): just hide it for this visit.
    }
  }

  return (
    <div className="relative mx-3 mt-4 overflow-hidden rounded-[26px] bg-jz-ink p-6 pr-12 text-white md:mx-0 md:mt-8">
      {/* The logo's red dot, rising like a sun behind the copy. */}
      <span
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-jz-red opacity-90 blur-[2px]"
        style={{ boxShadow: "0 0 90px 30px rgba(215,32,46,0.45)" }}
        aria-hidden
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("welcome.close")}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur hover:bg-black/30"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="relative max-w-[18rem] text-xl font-bold leading-snug tracking-tight">{t("welcome.heading")}</p>
      <p className="relative mt-2 text-sm leading-relaxed text-white/70">{t("welcome.body")}</p>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Link to="/register" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-jz-ink transition hover:bg-gray-100 active:scale-95">
          {t("welcome.registerTraveler")}
        </Link>
        <Link
          to="/register-municipality"
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20 active:scale-95"
        >
          {t("welcome.forMunicipality")}
        </Link>
      </div>
    </div>
  );
}
