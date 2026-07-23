import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { isDataSaverEnabled, setDataSaverEnabled } from "../components/AutoplayVideo";

function AvatarSection() {
  const { user, municipality, company, updateUser, setMunicipality, updateCompany } = useAuth();
  const [uploading, setUploading] = useState(false);

  const avatarUrl = municipality?.avatarUrl ?? company?.avatarUrl ?? user?.avatarUrl ?? null;
  const label = municipality ? municipality.name.slice(0, 1) : company ? company.name.slice(0, 1) : user?.name.slice(0, 1);

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      if (municipality) {
        const { data } = await api.post("/municipalities/me/avatar", fd);
        setMunicipality(data);
      } else if (company) {
        const { data } = await api.post("/companies/me/avatar", fd);
        updateCompany(data);
      } else {
        const { data } = await api.post("/auth/me/avatar", fd);
        updateUser(data);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-600">プロフィール画像</h2>
      <label className="group relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700 ring-1 ring-gray-200">
        {avatarUrl ? (
          <img src={avatarUrl} className="h-full w-full rounded-full object-cover" />
        ) : (
          label
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] text-white opacity-0 group-hover:opacity-100">
          {uploading ? "..." : "変更"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </label>
    </section>
  );
}

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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm text-gray-800">{label}</span>
        {description && <span className="block text-xs text-gray-400">{description}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-teal-600"
      />
    </label>
  );
}

function NotificationSection() {
  const { user, updateUser } = useAuth();
  const [notifyOnLike, setNotifyOnLike] = useState(user?.notifyOnLike ?? true);
  const [notifyOnComment, setNotifyOnComment] = useState(user?.notifyOnComment ?? true);
  const [saving, setSaving] = useState(false);

  async function save(next: { notifyOnLike?: boolean; notifyOnComment?: boolean }) {
    setSaving(true);
    try {
      const { data } = await api.put("/auth/me", next);
      updateUser(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">通知設定</h2>
      <p className="mb-2 text-xs text-gray-400">
        現在このアプリにはプッシュ通知・メール通知の送信機能がないため、ここでの設定は将来の通知機能のための保存のみで、今は挙動に影響しません。
      </p>
      <div className="divide-y divide-gray-100 lg:max-w-md">
        <ToggleRow
          label="いいね通知"
          description="自分の投稿にいいねが付いたときに通知を受け取る"
          checked={notifyOnLike}
          onChange={(v) => {
            setNotifyOnLike(v);
            save({ notifyOnLike: v });
          }}
        />
        <ToggleRow
          label="コメント通知"
          description="自分の投稿にコメントが付いたときに通知を受け取る"
          checked={notifyOnComment}
          onChange={(v) => {
            setNotifyOnComment(v);
            save({ notifyOnComment: v });
          }}
        />
      </div>
      {saving && <p className="mt-1 text-xs text-gray-400">保存中...</p>}
    </section>
  );
}

function CommentsPermissionSection() {
  const { municipality, company, setMunicipality, updateCompany } = useAuth();
  const [saving, setSaving] = useState(false);
  if (!municipality && !company) return null;

  const commentsEnabled = municipality?.commentsEnabled ?? company?.commentsEnabled ?? true;

  async function save(enabled: boolean) {
    setSaving(true);
    try {
      if (municipality) {
        const { data } = await api.put("/municipalities/me/profile", { commentsEnabled: enabled });
        setMunicipality(data);
      } else if (company) {
        const { data } = await api.put("/companies/me/profile", { commentsEnabled: enabled });
        updateCompany(data);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">コメントの許可</h2>
      <p className="mb-2 text-xs text-gray-400">
        {municipality
          ? "自治体名義の投稿（紐づく企業の投稿含む）へのコメントを受け付けるかどうかを設定します。"
          : "自社が投稿したリールへのコメントを受け付けるかどうかを設定します。"}
      </p>
      <div className="lg:max-w-md">
        <ToggleRow
          label="コメントを受け付ける"
          checked={commentsEnabled}
          onChange={save}
        />
      </div>
      {saving && <p className="mt-1 text-xs text-gray-400">保存中...</p>}
    </section>
  );
}

function DataSaverSection() {
  const [dataSaver, setDataSaver] = useState(isDataSaverEnabled());

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">モバイル通信の節約</h2>
      <p className="mb-2 text-xs text-gray-400">
        オンにすると、リール動画の自動再生・先読みを止め、タップして再生する方式に切り替わります（この端末・ブラウザのみの設定です）。
      </p>
      <div className="lg:max-w-md">
        <ToggleRow
          label="データ節約モード"
          checked={dataSaver}
          onChange={(v) => {
            setDataSaver(v);
            setDataSaverEnabled(v);
          }}
        />
      </div>
    </section>
  );
}

function LanguageSection() {
  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">表示言語</h2>
      <div className="flex gap-2 lg:max-w-md">
        <span className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">日本語</span>
        <span
          title="近日対応予定"
          className="cursor-not-allowed rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-300"
        >
          English（近日対応）
        </span>
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
    <section className="border-b border-gray-200 p-4 lg:p-6">
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

function DeleteAccountSection() {
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete("/auth/me", { data: { password } });
      logout();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-red-600">アカウントの削除</h2>
      <p className="mb-2 text-xs text-gray-400">
        アカウントを削除すると、投稿・いいね・コメントを含むすべてのデータが削除され、元に戻せません。
      </p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          アカウントを削除する
        </button>
      ) : (
        <div className="flex flex-col gap-2 lg:max-w-md">
          <label className="text-xs font-medium text-gray-500">
            確認のため現在のパスワードを入力してください
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-red-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={remove}
              disabled={deleting || !password}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              完全に削除する
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setError(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              キャンセル
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const { user, municipality, company, logout } = useAuth();
  const navigate = useNavigate();

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

      <AvatarSection />
      <ProfileSection />
      <NotificationSection />
      <CommentsPermissionSection />
      <DataSaverSection />
      <LanguageSection />
      <PasswordSection />

      <div className="border-b border-gray-200 p-4 lg:p-6">
        <button
          onClick={() => navigate("/privacy-policy")}
          className="text-sm font-medium text-teal-700 hover:underline"
        >
          プライバシーポリシーを見る ↗
        </button>
      </div>

      <div className="border-b border-gray-200 p-4 lg:p-6">
        <button
          onClick={() => logout()}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </div>

      <DeleteAccountSection />
    </div>
  );
}
