// The server's answer when today's free AI uses (and AIチケット) are used up:
// 402 with code "aiLimit" (backend lib/aiQuota.ts).
export function aiLimitOf(err: unknown): { signedIn: boolean } | null {
  const res = (err as { response?: { status?: number; data?: { code?: string; signedIn?: boolean } } })?.response;
  return res?.status === 402 && res.data?.code === "aiLimit" ? { signedIn: !!res.data.signedIn } : null;
}
