import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Fingerprint } from "lucide-react";
import { AUTH_NOTICE_KEY, useAuth } from "../auth/AuthContext";
import { canAutofillPasskeys, cancelPasskeySignIn, createPasskey, deviceCanCreatePasskey, listPasskeys, passkeysSupported } from "../lib/passkeys";
import { showToast } from "../lib/toast";

// After a password sign-in on a device that can hold a passkey, offer one
// once ("あとで" is remembered on this device).
const OFFER_DISMISSED_KEY = "jaziba:passkeyOfferDismissed";

const inputClass =
  "rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400";

export default function LoginPage() {
  const { login, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  // Pages that send people here to sign in (e.g. a shared しおり) pass where
  // to come back to; only same-app paths are honored.
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  const returnTo = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice] = useState(() => {
    const stored = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (stored) sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return stored;
  });

  const [offer, setOffer] = useState(false);
  const [creating, setCreating] = useState(false);
  function finish() {
    navigate(returnTo, { replace: returnTo !== "/" });
  }

  function passkeyError(err: any) {
    setError(err?.response?.data?.error ?? t("passkey.signInError"));
  }

  // Passkeys in the email field's suggestions (conditional UI): picking one
  // signs in straight away. Waits quietly until then; stopped on leaving.
  useEffect(() => {
    let alive = true;
    void canAutofillPasskeys().then((ok) => {
      if (!ok || !alive) return;
      loginWithPasskey(true)
        .then((signedIn) => signedIn && alive && finish())
        .catch((err) => alive && passkeyError(err));
    });
    return () => {
      alive = false;
      cancelPasskeySignIn();
    };
    // Once per visit to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePasskey() {
    setError(null);
    try {
      if (await loginWithPasskey(false)) finish();
    } catch (err) {
      passkeyError(err);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      if (await shouldOffer()) setOffer(true);
      else finish();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("login.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function shouldOffer() {
    try {
      if (localStorage.getItem(OFFER_DISMISSED_KEY)) return false;
    } catch {
      return false;
    }
    if (!(await deviceCanCreatePasskey())) return false;
    return (await listPasskeys().catch(() => [1])).length === 0;
  }

  async function acceptOffer() {
    setCreating(true);
    try {
      if (await createPasskey()) showToast(t("passkey.created"));
      finish();
    } catch {
      showToast(t("passkey.createError"));
      finish();
    }
  }

  function declineOffer() {
    try {
      localStorage.setItem(OFFER_DISMISSED_KEY, "1");
    } catch {
      // Private mode: it will just be offered again next time.
    }
    finish();
  }

  if (offer) {
    return (
      <div className="animate-page-in mx-4 my-8 rounded-3xl border border-gray-200/80 bg-white p-7 text-center sm:mx-auto sm:my-12 sm:max-w-sm sm:p-8">
        <span className="ai-orb mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white">
          <Fingerprint className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-lg font-extrabold text-jz-ink">{t("passkey.offerTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t("passkey.offerBody")}</p>
        <button
          type="button"
          onClick={() => void acceptOffer()}
          disabled={creating}
          className="mt-6 w-full rounded-full bg-jz-red py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {t("passkey.offerAccept")}
        </button>
        <button type="button" onClick={declineOffer} className="mt-2 w-full rounded-full py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50">
          {t("passkey.offerLater")}
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">{t("passkey.privacyNote")}</p>
      </div>
    );
  }

  return (
    <div className="mx-4 my-8 rounded-xl border border-gray-200/80 bg-white p-7 sm:mx-auto sm:my-12 sm:max-w-sm sm:p-8">
      <h1 className="mb-6 text-center text-xl font-bold text-gray-900">{t("login.title")}</h1>
      {notice && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">{notice}</p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="username webauthn"
          placeholder={t("login.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder={t("login.passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-jz-red">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gray-900 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t("login.submit")}
        </button>
      </form>
      {passkeysSupported() && (
        <>
          <div className="my-4 flex items-center gap-3 text-[11px] text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            {t("passkey.or")}
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <button
            type="button"
            onClick={() => void handlePasskey()}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 py-2 font-medium text-gray-900 hover:bg-gray-50"
          >
            <Fingerprint className="h-5 w-5" /> {t("passkey.signIn")}
          </button>
        </>
      )}
      <p className="mt-4 text-center text-sm text-gray-500">
        {t("login.touristPrompt")}
        <Link to="/register" className="ml-1 font-semibold text-gray-900 underline underline-offset-2">
          {t("login.touristLink")}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        {t("login.municipalityPrompt")}
        <Link to="/register-municipality" className="ml-1 font-semibold text-gray-900 underline underline-offset-2">
          {t("login.municipalityLink")}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        {t("login.companyPrompt")}
        <Link to="/register-company" className="ml-1 font-semibold text-gray-900 underline underline-offset-2">
          {t("login.companyLink")}
        </Link>
      </p>
    </div>
  );
}
