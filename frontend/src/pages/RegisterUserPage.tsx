import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RegisterUserPage() {
  const { registerUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerUser(form.email, form.password, form.name);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-6 text-xl font-bold">新規登録（観光客の方）</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          required
          placeholder="お名前"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="email"
          required
          placeholder="メールアドレス"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="パスワード（8文字以上）"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        {error && <p className="text-sm text-red-400">{typeof error === "string" ? error : "入力内容を確認してください"}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-purple-600 py-2 font-medium disabled:opacity-50"
        >
          登録する
        </button>
      </form>
    </div>
  );
}
