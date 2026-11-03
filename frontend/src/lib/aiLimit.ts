// The server's answer when today's free AI uses (and AIチケット) are used up:
// 402 with code "aiLimit" (backend lib/aiQuota.ts). `plan`: the paid plan in
// use, if any (then there's no plan to suggest).
export function aiLimitOf(err: unknown): { signedIn: boolean; plan: string | null } | null {
  const res = (err as { response?: { status?: number; data?: { code?: string; signedIn?: boolean; plan?: string | null } } })?.response;
  return res?.status === 402 && res.data?.code === "aiLimit" ? { signedIn: !!res.data.signedIn, plan: res.data.plan ?? null } : null;
}
