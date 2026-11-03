// プランを手動で付ける / 外す: for plans paid by invoice (自治体プロ) or given
// by the operator (also possible in the admin console, /admin). Card plans are
// managed by Stripe and its webhook instead.
//   npm run plan:grant -- <email> municipalityPro 12   (12 months from today)
//   npm run plan:grant -- <email> none                 (remove)
import { prisma } from "../prisma";
import { PLANS, grantPlan, type PlanId } from "../lib/plans";

async function main() {
  const [email, plan, monthsArg] = process.argv.slice(2);
  if (!email || !plan) {
    console.error("使い方: npm run plan:grant -- <メールアドレス> <municipalityPro|plus|business|none> [月数=12]");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) throw new Error(`アカウントが見つかりません: ${email}`);
  if (plan !== "none" && !(plan in PLANS)) throw new Error(`不明なプラン: ${plan}`);
  const result = await grantPlan(user.id, plan as PlanId | "none", Number(monthsArg ?? 12));
  console.log(result ? `${user.name}: ${plan} を ${result.currentPeriodEnd!.toISOString().slice(0, 10)} まで有効にしました` : `${user.name}: プランを外しました`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
