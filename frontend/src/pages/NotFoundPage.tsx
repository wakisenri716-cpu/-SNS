import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="text-6xl font-extrabold tracking-tight text-jz-ink">
        404<span className="ml-1 inline-block h-3 w-3 rounded-full bg-jz-red align-baseline" aria-hidden />
      </p>
      <h1 className="mt-4 text-lg font-bold text-jz-ink">{t("errors.notFoundTitle")}</h1>
      <p className="mt-2 text-sm text-gray-500">{t("errors.notFoundBody")}</p>
      <Link to="/" className="mt-6 rounded-full bg-jz-red px-6 py-2.5 text-sm font-bold text-white">
        {t("errors.goHome")}
      </Link>
    </div>
  );
}
