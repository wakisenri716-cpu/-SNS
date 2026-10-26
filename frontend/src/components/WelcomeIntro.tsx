import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

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
    <div className="relative mx-4 mt-4 overflow-hidden rounded-3xl bg-gray-900 p-5 pr-12 text-white shadow-lg lg:mx-6">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("welcome.close")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
      >
        ✕
      </button>
      <p className="text-base font-extrabold leading-snug">{t("welcome.heading")}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/75">{t("welcome.body")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/register" className="rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500">
          {t("welcome.registerTraveler")}
        </Link>
        <Link
          to="/register-municipality"
          className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white ring-1 ring-white/30 hover:bg-white/20"
        >
          {t("welcome.forMunicipality")}
        </Link>
      </div>
    </div>
  );
}
