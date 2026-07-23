import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const { data } = await api.put("/auth/me", { name, email });
      updateUser(data);
      setMessage("保存しました");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-600">アカウント情報</h2>
      <div className="flex flex-col gap-3 lg:max-w-md">
        <label className="text-xs font-medium text-gray-500">
          お名前
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="w-fit rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          保存
        </button>
        {message && <p className="text-xs text-teal-600">{message}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setMessage(null);
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/password", { currentPassword, newPassword });
      setMessage("パスワードを変更しました");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "変更に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="p-4 lg:p-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-600">パスワード変更</h2>
      <div className="flex flex-col gap-3 lg:max-w-md">
        <label className="text-xs font-medium text-gray-500">
          現在のパスワード
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          新しいパスワード（8文字以上）
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          新しいパスワード（確認）
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <button
          onClick={save}
          disabled={saving || !currentPassword || !newPassword}
          className="w-fit rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          パスワードを変更
        </button>
        {message && <p className="text-xs text-teal-600">{message}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, municipality, company, logout } = useAuth();

  return (
    <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:max-w-3xl">
      <div className="border-b border-gray-200 p-4 lg:p-6">
        <h1 className="text-xl font-bold text-gray-900">設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          {municipality
            ? `${municipality.name}（自治体アカウント）`
            : company
              ? `${company.name}（企業アカウント）`
              : `${user?.name}（一般ユーザー）`}
        </p>
      </div>

      <ProfileSection />
      <PasswordSection />

      <div className="border-t border-gray-200 p-4 lg:p-6">
        <button
          onClick={() => logout()}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
