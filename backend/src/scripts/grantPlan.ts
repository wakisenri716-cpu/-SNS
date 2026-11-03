// プランを手動で付ける / 外す: for plans paid by invoice (自治体プロ) or given
// by the operator. Card plans are managed by Stripe and its webhook instead.
//   npm run plan:grant -- <email> municipalityPro 12   (12 months from today)
//   npm run plan:grant -- <email> none                 (remove)
import { prisma } from "../prisma";
import { PLANS, type PlanId } from "../lib/plans";

async function main() {
  const [email, plan, monthsArg] = process.argv.slice(2);
  if (!email || !plan) {
    console.error("使い方: npm run plan:grant -- <メールアドレス> <municipalityPro|plus|business|none> [月数=12]");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true } });
  if (!user) throw new Error(`アカウントが見つかりません: ${email}`);
  const existing = await prisma.planSubscription.findUnique({ where: { userId: user.id } });

  if (plan === "none") {
    if (existing?.source === "stripe") throw new Error("カード払いのプランです。Stripeのダッシュボードから解約してください");
    await prisma.planSubscription.deleteMany({ where: { userId: user.id } });
    console.log(`${user.name}: プランを外しました`);
    return;
  }
  if (!(plan in PLANS)) throw new Error(`不明なプラン: ${plan}`);
  const id = plan as PlanId;
  if (PLANS[id].role !== user.role) throw new Error(`${id} は ${PLANS[id].role} のアカウント向けです（このアカウントは ${user.role}）`);
  if (existing?.source === "stripe") throw new Error("カード払いのプランがあります。先にStripeで解約してください");
  const months = Number(monthsArg ?? 12);
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error("月数は1〜60で指定してください");
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + months);
  const data = { plan: id, status: "active", source: "invoice", stripeSubscriptionId: null, currentPeriodEnd, cancelAtPeriodEnd: false };
  await prisma.planSubscription.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  console.log(`${user.name}: ${id} を ${currentPeriodEnd.toISOString().slice(0, 10)} まで有効にしました`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
