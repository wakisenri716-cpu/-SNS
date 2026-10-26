import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ItineraryPanel, useIsTraveler } from "../components/ItineraryRail";

// The しおり on screens too narrow for the side rail (see ItineraryRail),
// reached from the menu.
export default function ItineraryPage() {
  const { t } = useTranslation();
  const isTraveler = useIsTraveler();
  return (
    <div className="mx-auto flex max-w-lg flex-col p-4 md:p-8">
      {isTraveler ? (
        <ItineraryPanel />
      ) : (
        <p className="text-sm text-gray-500">
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t("itinerary.loginCta")}
          </Link>
        </p>
      )}
    </div>
  );
}
