import path from "path";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const SEED_ASSETS_DIR = path.resolve(__dirname, "../seed-assets");
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

function copySeedVideo(sourceFile: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const destName = `${crypto.randomUUID()}${path.extname(sourceFile)}`;
  fs.copyFileSync(path.join(SEED_ASSETS_DIR, sourceFile), path.join(UPLOAD_DIR, destName));
  return `/uploads/${destName}`;
}

interface SeedMunicipality {
  slug: string;
  name: string;
  prefecture: string;
  description: string;
  tourismInfo: string;
  accessInfo: string;
  lodgingInfo: string;
  restaurantInfo: string;
  reels: { caption: string; locationName: string; lat: number; lng: number }[];
}

const MUNICIPALITIES: SeedMunicipality[] = [
  {
    slug: "sakura",
    name: "さくら市",
    prefecture: "京都府",
    description: "古い町並みと四季の花で知られる観光都市です。",
    tourismInfo: "春は桜並木、秋は紅葉が人気。伝統工芸の体験施設もあります。",
    accessInfo: "最寄り駅からバスで15分。京都駅からは特急で40分です。",
    lodgingInfo: "町家を改装した宿や温泉旅館があります。",
    restaurantInfo: "老舗の和菓子店、湯豆腐料理店が人気です。",
    reels: [
      { caption: "桜並木が満開になりました🌸", locationName: "さくら並木通り", lat: 35.0116, lng: 135.7681 },
      { caption: "町家カフェでほっと一息", locationName: "さくら町家カフェ通り", lat: 35.014, lng: 135.77 },
      { caption: "夜のライトアップも必見です", locationName: "さくら城跡公園", lat: 35.02, lng: 135.76 },
    ],
  },
  {
    slug: "umino",
    name: "うみのしま町",
    prefecture: "沖縄県",
    description: "透明度の高い海とサンゴ礁が広がる離島の町です。",
    tourismInfo: "シュノーケリング・ダイビングスポットが充実。海亀に出会えることも。",
    accessInfo: "空港からフェリーで30分。港からは徒歩圏内に観光地が集まっています。",
    lodgingInfo: "海沿いのリゾートホテルからゲストハウスまで幅広く揃っています。",
    restaurantInfo: "新鮮な島魚料理と沖縄そばの名店があります。",
    reels: [
      { caption: "エメラルドグリーンの海です🌊", locationName: "うみのしまビーチ", lat: 26.2124, lng: 127.6809 },
      { caption: "サンゴ礁シュノーケリング体験", locationName: "うみのしま沖合", lat: 26.21, lng: 127.68 },
      { caption: "島の朝市もおすすめ", locationName: "うみのしま港", lat: 26.215, lng: 127.685 },
    ],
  },
  {
    slug: "yamabiko",
    name: "やまびこ村",
    prefecture: "長野県",
    description: "標高1000mの高原に広がる、避暑と星空観測で人気の村です。",
    tourismInfo: "トレッキングコースと天体観測イベントが充実しています。",
    accessInfo: "新幹線の駅からバスで50分。マイカーの場合はICから20分です。",
    lodgingInfo: "高原ペンションやキャンプ場が点在しています。",
    restaurantInfo: "地元の高原野菜を使ったレストランが人気です。",
    reels: [
      { caption: "満天の星空が広がります✨", locationName: "やまびこ高原展望台", lat: 36.2048, lng: 138.2529 },
      { caption: "朝霧に包まれる高原トレッキング", locationName: "やまびこ高原遊歩道", lat: 36.21, lng: 138.25 },
      { caption: "高原野菜のマルシェを開催中", locationName: "やまびこ村役場前", lat: 36.2, lng: 138.26 },
    ],
  },
  {
    slug: "yukiguni",
    name: "ゆきぐに市",
    prefecture: "北海道",
    description: "冬は極上のパウダースノー、夏は花畑が広がる四季折々の街です。",
    tourismInfo: "スキーリゾートと夏季のラベンダー畑が二大観光資源です。",
    accessInfo: "新千歳空港からバスで2時間。冬季は空港からの直通バスも運行します。",
    lodgingInfo: "スキーインスキーアウトのホテルが充実しています。",
    restaurantInfo: "濃厚なスープカレーとジンギスカンの名店があります。",
    reels: [
      { caption: "極上のパウダースノーが降りました❄️", locationName: "ゆきぐにスキー場", lat: 43.0642, lng: 141.3469 },
      { caption: "夏はラベンダー畑が見頃です", locationName: "ゆきぐにラベンダー園", lat: 43.07, lng: 141.35 },
      { caption: "地元名物のスープカレーはいかが？", locationName: "ゆきぐに駅前商店街", lat: 43.06, lng: 141.34 },
    ],
  },
];

const VIDEO_FILES = ["reel1.webm", "reel2.webm", "reel3.webm", "reel4.webm"];
const SEED_PASSWORD = "password123";

// Populates a handful of demo municipalities (+ one linked company) with reels so
// the feed isn't empty on first look. Runs automatically at server startup (see
// index.ts) but only when the municipality table is empty — on the Render free
// deployment the database resets on every restart, so without this the app would
// otherwise greet every wake-up with a blank feed. Safe to run repeatedly: it
// no-ops once any municipality already exists.
export async function seedIfEmpty() {
  const existing = await prisma.municipality.count();
  if (existing > 0) return;

  console.log("[seed] Database is empty, creating demo municipalities and reels...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  let clipIndex = 0;
  let sakuraId: string | null = null;

  for (const m of MUNICIPALITIES) {
    const user = await prisma.user.create({
      data: {
        email: `demo-${m.slug}@example.com`,
        passwordHash,
        name: `${m.name} 観光課`,
        role: "MUNICIPALITY",
        municipality: {
          create: {
            name: m.name,
            prefecture: m.prefecture,
            description: m.description,
            tourismInfo: m.tourismInfo,
            accessInfo: m.accessInfo,
            lodgingInfo: m.lodgingInfo,
            restaurantInfo: m.restaurantInfo,
          },
        },
      },
      include: { municipality: true },
    });
    const municipalityId = user.municipality!.id;
    if (m.slug === "sakura") sakuraId = municipalityId;

    for (const r of m.reels) {
      const videoUrl = copySeedVideo(VIDEO_FILES[clipIndex % VIDEO_FILES.length]);
      clipIndex++;
      await prisma.reel.create({
        data: {
          municipalityId,
          videoUrl,
          caption: r.caption,
          locationName: r.locationName,
          locationLat: r.lat,
          locationLng: r.lng,
        },
      });
    }
  }

  // One company account to demo the "posted by a linked company" attribution.
  if (sakuraId) {
    const companyUser = await prisma.user.create({
      data: {
        email: "demo-company@example.com",
        passwordHash,
        name: "さくら観光協会 担当",
        role: "COMPANY",
        company: { create: { name: "さくら観光協会", municipalityId: sakuraId } },
      },
      include: { company: true },
    });
    await prisma.reel.create({
      data: {
        municipalityId: sakuraId,
        companyId: companyUser.company!.id,
        videoUrl: copySeedVideo("reel5.webm"),
        caption: "地元企業からもさくら市の魅力をお届けします！",
        locationName: "さくら駅前広場",
        locationLat: 35.015,
        locationLng: 135.765,
      },
    });
  }

  console.log(
    `[seed] Done. Demo accounts use password "${SEED_PASSWORD}" (e.g. demo-sakura@example.com, demo-company@example.com).`
  );
}
