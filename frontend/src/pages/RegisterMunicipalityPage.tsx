import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PREFECTURES } from "../lib/regions";
import { useAuth } from "../auth/AuthContext";


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
    "rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400";

  return (
    <div className="mx-4 my-8 rounded-xl border border-gray-200/80 bg-white p-7 sm:mx-auto sm:my-12 sm:max-w-sm sm:p-8">
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
          className="rounded-full bg-gray-900 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t("registerMunicipality.submit")}
        </button>
      </form>
    </div>
  );
}
