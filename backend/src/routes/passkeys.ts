import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { loginLimiter, passkeyOptionsLimiter } from "../middleware/rateLimit";
import { signedInPayload } from "./auth";

// パスキー (WebAuthn): sign in with Face ID / Touch ID / Windows Hello / an
// Android fingerprint instead of the password. A signed-in user adds a
// passkey from Settings; signing in needs no email — the browser offers the
// passkeys it has for this site (discoverable credentials), also right in the
// email field's autofill.
//
// The site's identity (RP ID) and origin come from the page that called
// (the Origin header, else this server's own host), so the same code works on
// localhost — behind the Vite dev proxy too — and on the deployed domain.
// That's safe even though a direct API call can fake those headers: the
// authenticator signs the real site's RP ID and origin, which then wouldn't
// match, and a passkey made on another site only ever signs in the account
// that made it. WEBAUTHN_ORIGIN (e.g. https://jaziba.jp) pins it instead.
const router = Router();

const RP_NAME = "ジャジバ";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 2000;
const MAX_PASSKEYS = 10;

function site(req: Request) {
  const origin = process.env.WEBAUTHN_ORIGIN || req.get("origin") || `${req.protocol}://${req.get("host")}`;
  let rpID: string;
  try {
    rpID = new URL(origin).hostname;
  } catch {
    rpID = req.hostname;
  }
  return { origin, rpID };
}

// Challenges waiting for the browser's answer (per server instance), one use each.
const pending = new Map<string, { challenge: string; userId: string | null; expires: number }>();

function remember(key: string, challenge: string, userId: string | null) {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires <= now) pending.delete(k);
  while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value!);
  pending.set(key, { challenge, userId, expires: now + CHALLENGE_TTL_MS });
}

function takeChallenge(key: string) {
  const entry = pending.get(key);
  pending.delete(key);
  return entry && entry.expires > Date.now() ? entry : null;
}

// A label for the list in Settings, from the browser's user agent.
function deviceName(userAgent = "") {
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Android/.test(userAgent)) return "Android";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Linux/.test(userAgent)) return "Linux";
  return "";
}

const transportsOf = (s: string) => (s ? s.split(",") : undefined) as ("internal" | "hybrid")[] | undefined;

// ---- Adding a passkey (signed in) -------------------------------------------

router.post("/register/options", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { id: true, email: true, name: true, passkeys: { select: { id: true, transports: true } } },
  });
  if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });
  if (user.passkeys.length >= MAX_PASSKEYS) return res.status(400).json({ error: `パスキーは${MAX_PASSKEYS}個まで登録できます` });
  const { rpID } = site(req);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    // Don't make a second passkey on a device that already has one.
    excludeCredentials: user.passkeys.map((p) => ({ id: p.id, transports: transportsOf(p.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  remember(`reg:${user.id}`, options.challenge, user.id);
  res.json(options);
});

const registerSchema = z.object({ response: z.any() });

router.post("/register/verify", requireAuth, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  const expected = takeChallenge(`reg:${req.auth!.userId}`);
  if (!parsed.success || !expected) return res.status(400).json({ error: "もう一度パスキーの作成をお試しください" });
  const { origin, rpID } = site(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data.response,
      expectedChallenge: expected.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    console.warn("[passkey] registration rejected:", (err as Error).message);
    return res.status(400).json({ error: "パスキーを確認できませんでした" });
  }
  if (!verification.verified) return res.status(400).json({ error: "パスキーを確認できませんでした" });
  const { credential, credentialBackedUp } = verification.registrationInfo;
  if (await prisma.passkey.findUnique({ where: { id: credential.id } })) {
    return res.status(409).json({ error: "このパスキーは登録済みです" });
  }
  const passkey = await prisma.passkey.create({
    data: {
      id: credential.id,
      userId: req.auth!.userId,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []).join(","),
      backedUp: credentialBackedUp,
      name: deviceName(req.get("user-agent")),
    },
  });
  res.status(201).json(serialize(passkey));
});

// ---- The user's passkeys ----------------------------------------------------

function serialize(p: { id: string; name: string; backedUp: boolean; createdAt: Date; lastUsedAt: Date | null }) {
  return { id: p.id, name: p.name, backedUp: p.backedUp, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt };
}

router.get("/", requireAuth, async (req, res) => {
  const passkeys = await prisma.passkey.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "asc" } });
  res.json({ items: passkeys.map(serialize) });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const { count } = await prisma.passkey.deleteMany({ where: { id: req.params.id, userId: req.auth!.userId } });
  if (count === 0) return res.status(404).json({ error: "パスキーが見つかりません" });
  res.status(204).end();
});

// ---- Signing in with a passkey ---------------------------------------------

// No email needed: the browser lists this site's passkeys itself.
router.post("/login/options", passkeyOptionsLimiter, async (req, res) => {
  const { rpID } = site(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  const flowId = randomBytes(16).toString("base64url");
  remember(`login:${flowId}`, options.challenge, null);
  res.json({ flowId, options });
});

const loginSchema = z.object({ flowId: z.string().max(64), response: z.object({ id: z.string().max(1024) }).passthrough() });

router.post("/login/verify", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  const expected = parsed.success ? takeChallenge(`login:${parsed.data.flowId}`) : null;
  if (!parsed.success || !expected) return res.status(400).json({ error: "もう一度パスキーでのログインをお試しください" });
  const passkey = await prisma.passkey.findUnique({ where: { id: parsed.data.response.id } });
  // 401 like a wrong password; the passkey may have been removed in Settings.
  // `unknownCredential` lets the browser drop it from its list (Signal API).
  if (!passkey) {
    return res.status(401).json({ error: "このパスキーは登録されていません。パスワードでログインしてください", unknownCredential: true });
  }
  const { origin, rpID } = site(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: parsed.data.response as unknown as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: expected.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: passkey.id, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: transportsOf(passkey.transports) },
      requireUserVerification: false,
    });
  } catch (err) {
    console.warn("[passkey] sign-in rejected:", (err as Error).message);
    return res.status(401).json({ error: "パスキーを確認できませんでした" });
  }
  if (!verification.verified) return res.status(401).json({ error: "パスキーを確認できませんでした" });
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, backedUp: verification.authenticationInfo.credentialBackedUp, lastUsedAt: new Date() },
  });
  const payload = await signedInPayload(passkey.userId);
  if (!payload) return res.status(401).json({ error: "アカウントが見つかりません" });
  res.json(payload);
});

export default router;
