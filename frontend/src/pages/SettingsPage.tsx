import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { isDataSaverEnabled, setDataSaverEnabled } from "../components/AutoplayVideo";
import { SUPPORTED_LANGUAGES, setAppLanguage, type SupportedLanguage } from "../i18n";

function AvatarSection() {
  const { t } = useTranslation();
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
      <h2 className="mb-3 text-sm font-semibold text-gray-600">{t("settings.avatarHeading")}</h2>
      <label className="group relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700 ring-1 ring-gray-200">
        {avatarUrl ? (
          <img src={avatarUrl} className="h-full w-full rounded-full object-cover" />
        ) : (
          label
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] text-white opacity-0 group-hover:opacity-100">
          {uploading ? "..." : t("settings.avatarChange")}
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
  const { t } = useTranslation();
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
      setMessage(t("settings.saveSuccess"));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-600">{t("settings.profileHeading")}</h2>
      <div className="flex flex-col gap-3 lg:max-w-md">
        <label className="text-xs font-medium text-gray-500">
          {t("settings.nameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          {t("settings.emailLabel")}
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
          {t("settings.save")}
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
  const { t } = useTranslation();
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
      <h2 className="mb-1 text-sm font-semibold text-gray-600">{t("settings.notificationHeading")}</h2>
      <p className="mb-2 text-xs text-gray-400">{t("settings.notificationDisclaimer")}</p>
      <div className="divide-y divide-gray-100 lg:max-w-md">
        <ToggleRow
          label={t("settings.notifyLikeLabel")}
          description={t("settings.notifyLikeDescription")}
          checked={notifyOnLike}
          onChange={(v) => {
            setNotifyOnLike(v);
            save({ notifyOnLike: v });
          }}
        />
        <ToggleRow
          label={t("settings.notifyCommentLabel")}
          description={t("settings.notifyCommentDescription")}
          checked={notifyOnComment}
          onChange={(v) => {
            setNotifyOnComment(v);
            save({ notifyOnComment: v });
          }}
        />
      </div>
      {saving && <p className="mt-1 text-xs text-gray-400">{t("settings.saving")}</p>}
    </section>
  );
}

function CommentsPermissionSection() {
  const { t } = useTranslation();
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
      <h2 className="mb-1 text-sm font-semibold text-gray-600">{t("settings.commentsHeading")}</h2>
      <p className="mb-2 text-xs text-gray-400">
        {municipality
          ? t("settings.commentsDescriptionMunicipality")
          : t("settings.commentsDescriptionCompany")}
      </p>
      <div className="lg:max-w-md">
        <ToggleRow label={t("settings.commentsToggleLabel")} checked={commentsEnabled} onChange={save} />
      </div>
      {saving && <p className="mt-1 text-xs text-gray-400">{t("settings.saving")}</p>}
    </section>
  );
}

function DataSaverSection() {
  const { t } = useTranslation();
  const [dataSaver, setDataSaver] = useState(isDataSaverEnabled());

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">{t("settings.dataSaverHeading")}</h2>
      <p className="mb-2 text-xs text-gray-400">{t("settings.dataSaverDescription")}</p>
      <div className="lg:max-w-md">
        <ToggleRow
          label={t("settings.dataSaverToggleLabel")}
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

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
  ko: "한국어",
};

function LanguageSection() {
  const { t, i18n } = useTranslation();

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">{t("settings.languageHeading")}</h2>
      <div className="flex flex-wrap gap-2 lg:max-w-md">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setAppLanguage(lang)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              i18n.language === lang
                ? "bg-teal-600 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {LANGUAGE_LABELS[lang]}
          </button>
        ))}
      </div>
    </section>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
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
      setError(t("settings.passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/password", { currentPassword, newPassword });
      setMessage(t("settings.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("settings.passwordChangeError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-gray-200 p-4 lg:p-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-600">{t("settings.passwordHeading")}</h2>
      <div className="flex flex-col gap-3 lg:max-w-md">
        <label className="text-xs font-medium text-gray-500">
          {t("settings.currentPasswordLabel")}
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          {t("settings.newPasswordLabel")}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-teal-500"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          {t("settings.confirmPasswordLabel")}
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
          {t("settings.changePassword")}
        </button>
        {message && <p className="text-xs text-teal-600">{message}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </section>
  );
}

function DeleteAccountSection() {
  const { t } = useTranslation();
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
      setError(err?.response?.data?.error ?? t("settings.deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="p-4 lg:p-6">
      <h2 className="mb-1 text-sm font-semibold text-red-600">{t("settings.deleteHeading")}</h2>
      <p className="mb-2 text-xs text-gray-400">{t("settings.deleteWarning")}</p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          {t("settings.deleteButton")}
        </button>
      ) : (
        <div className="flex flex-col gap-2 lg:max-w-md">
          <label className="text-xs font-medium text-gray-500">
            {t("settings.deleteConfirmLabel")}
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
              {t("settings.deleteConfirmButton")}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setError(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {t("settings.deleteCancelButton")}
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, municipality, company, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:max-w-3xl">
      <div className="border-b border-gray-200 p-4 lg:p-6">
        <h1 className="text-xl font-bold text-gray-900">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {municipality
            ? t("settings.accountMunicipality", { name: municipality.name })
            : company
              ? t("settings.accountCompany", { name: company.name })
              : t("settings.accountUser", { name: user?.name })}
        </p>
      </div>

      <AvatarSection />
      <ProfileSection />
      <NotificationSection />
      <CommentsPermissionSection />
      <DataSaverSection />
      <LanguageSection />
      <PasswordSection />

      <div className="flex flex-col items-start gap-2 border-b border-gray-200 p-4 lg:p-6">
        <button
          onClick={() => navigate("/privacy-policy")}
          className="text-sm font-medium text-teal-700 hover:underline"
        >
          {t("settings.privacyPolicyLink")}
        </button>
        <button onClick={() => navigate("/contact")} className="text-sm font-medium text-teal-700 hover:underline">
          {t("settings.contactLink")}
        </button>
      </div>

      <div className="border-b border-gray-200 p-4 lg:p-6">
        <button
          onClick={() => logout()}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          {t("settings.logout")}
        </button>
      </div>

      <DeleteAccountSection />
    </div>
  );
}
