import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:max-w-3xl lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">{t("privacyPolicy.title")}</h1>
      <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{t("privacyPolicy.draftNotice")}</p>

      <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t("privacyPolicy.section1Heading")}</h2>
          <p>{t("privacyPolicy.section1Intro")}</p>
          <ul className="mt-1 list-disc pl-5">
            <li>{t("privacyPolicy.section1Item1")}</li>
            <li>{t("privacyPolicy.section1Item2")}</li>
            <li>{t("privacyPolicy.section1Item3")}</li>
            <li>{t("privacyPolicy.section1Item4")}</li>
            <li>{t("privacyPolicy.section1Item5")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t("privacyPolicy.section2Heading")}</h2>
          <p>{t("privacyPolicy.section2Body")}</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t("privacyPolicy.section3Heading")}</h2>
          <p>{t("privacyPolicy.section3Body")}</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t("privacyPolicy.section4Heading")}</h2>
          <p>{t("privacyPolicy.section4Body")}</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t("privacyPolicy.section5Heading")}</h2>
          <p>{t("privacyPolicy.section5Body")}</p>
          <Link to="/contact" className="mt-1 inline-block text-teal-700 hover:underline">
            {t("privacyPolicy.section5Link")}
          </Link>
        </section>
      </div>
    </div>
  );
}
