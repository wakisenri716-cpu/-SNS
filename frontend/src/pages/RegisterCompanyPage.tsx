import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Municipality } from "../types";

const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500";

export default function RegisterCompanyPage() {
  const { registerCompany } = useAuth();
  const navigate = useNavigate();
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
      setError(err?.response?.data?.error ?? "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm my-12">
      <h1 className="mb-2 text-center text-xl font-bold text-gray-900">企業アカウント登録</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        登録済みの観光自治体を選び、その自治体名義でリールを投稿できる企業アカウントを作成します。
      </p>

      {municipalities.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
          まだ登録されている自治体がありません。先に自治体アカウントが登録される必要があります。
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-gray-500">
            紐づける自治体
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
            placeholder="企業名（例：○○観光協会）"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={inputClass}
          />
          <input
            required
            placeholder="担当者名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
          <input
            type="email"
            required
            placeholder="担当者メールアドレス"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="パスワード（8文字以上）"
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
            企業として登録する
          </button>
        </form>
      )}
    </div>
  );
}
