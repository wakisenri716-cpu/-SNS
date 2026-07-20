import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-6 text-xl font-bold">ログイン</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-purple-600 py-2 font-medium disabled:opacity-50"
        >
          ログイン
        </button>
      </form>
      <p className="mt-4 text-sm text-white/60">
        観光客として初めての方は
        <Link to="/register" className="ml-1 text-purple-400">
          新規登録
        </Link>
      </p>
      <p className="mt-2 text-sm text-white/60">
        自治体の方は
        <Link to="/register-municipality" className="ml-1 text-purple-400">
          自治体アカウント登録
        </Link>
      </p>
    </div>
  );
}
