import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export default function RegisterMunicipalityPage() {
  const { registerMunicipality } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    municipalityName: "",
    prefecture: PREFECTURES[0],
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerMunicipality(form);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("registerMunicipality.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500";

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm my-12">
      <h1 className="mb-2 text-center text-xl font-bold text-gray-900">{t("registerMunicipality.title")}</h1>
      <p className="mb-6 text-center text-sm text-gray-500">{t("registerMunicipality.description")}</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          required
          placeholder={t("registerMunicipality.municipalityNamePlaceholder")}
          value={form.municipalityName}
          onChange={(e) => setForm({ ...form, municipalityName: e.target.value })}
          className={inputClass}
        />
        <select
          value={form.prefecture}
          onChange={(e) => setForm({ ...form, prefecture: e.target.value })}
          className={inputClass}
        >
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          required
          placeholder={t("registerMunicipality.staffNamePlaceholder")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
        <input
          type="email"
          required
          placeholder={t("registerMunicipality.emailPlaceholder")}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t("registerMunicipality.passwordPlaceholder")}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-teal-600 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {t("registerMunicipality.submit")}
        </button>
      </form>
    </div>
  );
}
