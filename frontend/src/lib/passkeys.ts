import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  sendSignal,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from "@simplewebauthn/browser";
import { api } from "../api/client";

// パスキー: sign in with the device's face / fingerprint / PIN (WebAuthn).
// The face or fingerprint never leaves the device — the browser only sends
// a signature that the server checks with the stored public key.

export interface PasskeyInfo {
  id: string;
  name: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export const passkeysSupported = () => browserSupportsWebAuthn();

// Whether this device itself can make one (Face ID, Touch ID, Windows Hello...).
export async function deviceCanCreatePasskey() {
  return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable().catch(() => false));
}

export async function canAutofillPasskeys() {
  return browserSupportsWebAuthn() && (await browserSupportsWebAuthnAutofill().catch(() => false));
}

// The /auth/login-shaped answer, or null when the person cancelled.
// `autofill` waits for them to pick a passkey from the email field's
// suggestions instead of opening the dialog right away.
export async function signInWithPasskey(autofill = false) {
  const { data } = await api.post<{ flowId: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
    "/auth/passkey/login/options"
  );
  let response;
  try {
    response = await startAuthentication({ optionsJSON: data.options, useBrowserAutofill: autofill });
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
  try {
    return (await api.post("/auth/passkey/login/verify", { flowId: data.flowId, response })).data;
  } catch (err) {
    // Deleted on the server: ask the browser / password manager to forget it too.
    if ((err as { response?: { data?: { unknownCredential?: boolean } } }).response?.data?.unknownCredential) {
      void sendSignal({ signalName: "unknownCredential", rpID: location.hostname, credentialID: response.id }).catch(() => {});
    }
    throw err;
  }
}

// Stops a waiting autofill sign-in (e.g. when leaving the login page).
export function cancelPasskeySignIn() {
  WebAuthnAbortService.cancelCeremony();
}

// Adds a passkey on this device for the signed-in user; false if cancelled.
export async function createPasskey() {
  const { data: options } = await api.post("/auth/passkey/register/options");
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
  return (await api.post<PasskeyInfo>("/auth/passkey/register/verify", { response })).data;
}

export async function listPasskeys() {
  return (await api.get<{ items: PasskeyInfo[] }>("/auth/passkey")).data.items;
}

// After deleting, tell the browser which passkeys still work for this account,
// so the deleted one stops being offered (Signal API; ignored where unsupported).
export async function deletePasskey(id: string, userId: string, remainingIds: string[]) {
  await api.delete(`/auth/passkey/${encodeURIComponent(id)}`);
  void sendSignal({
    signalName: "allAcceptedCredentials",
    rpID: location.hostname,
    userID: base64url(userId),
    allAcceptedCredentialIDs: remainingIds,
  }).catch(() => {});
}

// The WebAuthn user handle is the account id's UTF-8 bytes (see the server).
function base64url(text: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// The person closed the dialog, it timed out, or another sign-in replaced it.
function isCancel(err: unknown) {
  const name = (err as { name?: string })?.name;
  return name === "NotAllowedError" || name === "AbortError";
}
