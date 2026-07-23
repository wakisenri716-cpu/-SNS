import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Municipality } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500";

export default function RegisterCompanyPage() {
  const { registerCompany } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [form, setForm] = useState({
    companyName: "",
    municipalityId: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/municipalities").then(({ data }: { data: Municipality[] }) => {
      setMunicipalities(data);
      if (data.length > 0) setForm((f) => ({ ...f, municipalityId: data[0].id }));
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerCompany(form);
      navigate("/company-dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("registerUser.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm my-12">
      <h1 className="mb-2 text-center text-xl font-bold text-gray-900">{t("registerCompany.title")}</h1>
      <p className="mb-6 text-center text-sm text-gray-500">{t("registerCompany.description")}</p>

      {municipalities.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
          {t("registerCompany.noMunicipalities")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-gray-500">
            {t("registerCompany.municipalityLabel")}
            <select
              required
              value={form.municipalityId}
              onChange={(e) => setForm({ ...form, municipalityId: e.target.value })}
              className={`mt-1 block w-full ${inputClass}`}
            >
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.prefecture}）
                </option>
              ))}
            </select>
          </label>
          <input
            required
            placeholder={t("registerCompany.companyNamePlaceholder")}
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={inputClass}
          />
          <input
            required
            placeholder={t("registerCompany.staffNamePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
          <input
            type="email"
            required
            placeholder={t("registerCompany.emailPlaceholder")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder={t("registerCompany.passwordPlaceholder")}
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
            {t("registerCompany.submit")}
          </button>
        </form>
      )}
    </div>
  );
}
