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
    <div className="relative m-3 rounded-xl border border-teal-100 bg-teal-50 p-4 pr-10">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("welcome.close")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-teal-700 hover:bg-teal-100"
      >
        ✕
      </button>
      <p className="text-sm font-bold text-teal-900">{t("welcome.heading")}</p>
      <p className="mt-1 text-xs leading-relaxed text-teal-900/80">{t("welcome.body")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/register" className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
          {t("welcome.registerTraveler")}
        </Link>
        <Link
          to="/register-municipality"
          className="rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
        >
          {t("welcome.forMunicipality")}
        </Link>
      </div>
    </div>
  );
}
