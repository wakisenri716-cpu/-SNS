import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { OPERATOR_INFO } from "../lib/operatorInfo";

// 特定商取引法に基づく表記: required in Japan for selling the paid plans.
// The operator's own details come from lib/operatorInfo.ts.
const ROWS = ["seller", "manager", "address", "phone", "email", "price", "extraCost", "payment", "timing", "delivery", "cancel", "environment"] as const;

export default function CommercePage() {
  const { t } = useTranslation();
  const filled = Object.values(OPERATOR_INFO).every(Boolean);
  const value = (k: (typeof ROWS)[number]) => {
    if (k in OPERATOR_INFO) return OPERATOR_INFO[k as keyof typeof OPERATOR_INFO] || t("commerce.unfilled");
    if (k === "email")
      return (
        <Link to="/contact" className="font-semibold text-jz-accent underline">
          {t("commerce.emailValue")}
        </Link>
      );
    return t(`commerce.${k}Value`);
  };
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden border-gray-200 bg-white p-6 sm:my-6 sm:rounded-xl sm:border lg:max-w-3xl lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">{t("commerce.title")}</h1>
      {!filled && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("commerce.draftNotice")}</p>}
      <dl className="mt-6 divide-y divide-gray-100 text-sm">
        {ROWS.map((k) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="font-semibold text-gray-900">{t(`commerce.${k}`)}</dt>
            <dd className="leading-relaxed text-gray-700">{value(k)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
