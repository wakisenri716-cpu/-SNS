import rateLimit from "express-rate-limit";

// Per-IP limits on endpoints worth abusing (password guessing, account or
// spam creation). Counters live in memory, so they reset when the server
// restarts — fine for a single instance. Relies on `trust proxy` being set
// to the real number of proxy hops (see index.ts) so req.ip is the client.
function limiter(windowMinutes: number, max: number, message: string, skipSuccessfulRequests = false) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    skipSuccessfulRequests,
    standardHeaders: "draft-7",
    // The API tests make many accounts and requests from one address.
    skip: () => process.env.DISABLE_RATE_LIMITS === "1",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

// Only failed logins count, so people sharing one network aren't locked out
// by each other's normal use.
export const loginLimiter = limiter(
  15,
  10,
  "ログインの失敗が続いたため、しばらく時間をおいてから再度お試しください",
  true
);
export const registerLimiter = limiter(60, 10, "登録の回数が多すぎます。しばらく時間をおいてから再度お試しください");
export const writeLimiter = limiter(10, 30, "短時間に投稿しすぎています。しばらく時間をおいてから再度お試しください");
export const inquiryLimiter = limiter(60, 5, "お問い合わせの送信回数が多すぎます。しばらく時間をおいてから再度お試しください");
// Each concierge request may call the Claude API, so keep it to a sensible pace.
export const conciergeLimiter = limiter(10, 20, "AIへの相談が続いたため、少し時間をおいてから再度お試しください");
// Translations are cached, so only first-time translations cost an API call.
export const translateLimiter = limiter(10, 60, "翻訳の回数が多すぎます。少し時間をおいてから再度お試しください");
// A shared しおり link is public and each view may estimate every leg with the
// maps API, so cap how often one visitor can reload it.
export const tripViewLimiter = limiter(10, 60, "表示の回数が多すぎます。少し時間をおいてから再度お試しください");
// Live reactions are tiny, but a script could still spam them to viewers.
export const reactionLimiter = limiter(1, 40, "リアクションが多すぎます。少し時間をおいてください");
