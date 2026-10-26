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
