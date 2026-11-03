// AIの利用レポート: what the AI features really used and cost, from the
// usage log (AiUsage) — per month (Japan time) and feature. Run:
//   npm run ai:report            (this month and last)
//   npm run ai:report -- 2026-11 (one month)
// Costs are estimates from list prices (services/claude.ts); the Anthropic
// invoice is what counts. USD_JPY sets the exchange rate (default 150).
import { prisma } from "../prisma";
import { todayInJapan } from "../routes/events";

const rate = Number(process.env.USD_JPY) || 150;

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { gte: new Date(`${month}-01T00:00:00+09:00`), lt: new Date(`${next}-01T00:00:00+09:00`) };
}
function previous(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const yen = (microUsd: number) => `${Math.round((microUsd / 1_000_000) * rate).toLocaleString("ja-JP")}円`;
const usd = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(2)}`;

async function report(month: string) {
  const createdAt = monthRange(month);
  const rows = await prisma.aiUsage.groupBy({
    by: ["feature"],
    where: { createdAt },
    _count: true,
    _sum: { units: true, paidUnits: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, costMicroUsd: true },
  });
  const [users, visitors] = await Promise.all([
    prisma.aiUsage.groupBy({ by: ["userId"], where: { createdAt, userId: { not: null } } }).then((r) => r.length),
    prisma.aiUsage.count({ where: { createdAt, userId: null } }),
  ]);
  console.log(`\n=== ${month}（日本時間）===`);
  if (rows.length === 0) return console.log("記録なし");
  let total = 0;
  let requests = 0;
  for (const r of rows) {
    const s = r._sum;
    const cost = s.costMicroUsd ?? 0;
    const input = (s.inputTokens ?? 0) + (s.cacheReadTokens ?? 0) + (s.cacheWriteTokens ?? 0);
    total += cost;
    requests += r._count;
    console.log(
      [
        r.feature.padEnd(15),
        `${r._count}回`,
        `${s.units ?? 0}回分（うちチケット${s.paidUnits ?? 0}）`,
        `入力${input.toLocaleString()}（キャッシュ読み${input ? Math.round(((s.cacheReadTokens ?? 0) / input) * 100) : 0}%）`,
        `出力${(s.outputTokens ?? 0).toLocaleString()}`,
        `${usd(cost)} ≈ ${yen(cost)}`,
        `1回 ${yen(r._count ? cost / r._count : 0)}`,
      ].join("  ")
    );
  }
  console.log(`合計 ${requests}回  ${usd(total)} ≈ ${yen(total)}  利用者${users}人・ログインなし${visitors}回`);
}

async function main() {
  const asked = process.argv[2];
  const months = asked && /^\d{4}-\d{2}$/.test(asked) ? [asked] : [todayInJapan().slice(0, 7), previous(todayInJapan().slice(0, 7))];
  console.log(`AIの利用レポート（料金は定価からの概算、1ドル=${rate}円）`);
  for (const m of months) await report(m);
  await prisma.$disconnect();
}

void main();
