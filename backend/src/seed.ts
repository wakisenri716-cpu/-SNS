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
  // Reference point for the built-in access planner (see maasProvider.ts) —
  // real coordinates so "アクセスを調べる" returns a genuine walking/driving
  // estimate instead of falling back to an ungeocoded municipality.
  nearestStationName: string;
  nearestStationLat: number;
  nearestStationLng: number;
  reels: { caption: string; locationName: string; lat: number; lng: number; category: string }[];
}

// Single real destination (not a placeholder town): 上高地 (Kamikochi), the
// mountain resort in Matsumoto City, Nagano — see the researched access
// comparison built alongside this change. Coordinates are Kappabashi bridge,
// Kamikochi's best-known landmark.
const MUNICIPALITIES: SeedMunicipality[] = [
  {
    slug: "matsumoto",
    name: "松本市",
    prefecture: "長野県",
    description: "北アルプスの玄関口。特別名勝・特別天然記念物「上高地」を擁する山岳観光都市です。",
    tourismInfo:
      "河童橋・大正池をはじめ、穂高連峰を望む梓川沿いの遊歩道が広がります。例年4月中旬〜11月中旬が開山期間で、冬期は閉鎖されます。",
    accessInfo:
      "上高地は通年マイカー規制のため、車は松本ICから沢渡（さわんど）駐車場までで、その先はシャトルバスかタクシーに乗り換えが必要です。松本駅からは、アルピコ交通上高地線で新島々駅まで約30分、そこから路線バスで上高地バスターミナルまで約1時間です。",
    lodgingInfo: "上高地帝国ホテルや上高地温泉ホテルなど、梓川沿いの山岳リゾートホテルが点在しています。",
    restaurantInfo: "河童橋周辺には信州そばや岩魚料理を提供する食堂・カフェが並びます。",
    nearestStationName: "松本駅",
    nearestStationLat: 36.238,
    nearestStationLng: 137.972,
    reels: [
      { caption: "河童橋から望む穂高連峰は圧巻です⛰️", locationName: "上高地 河童橋", lat: 36.251, lng: 137.6389, category: "nature" },
    ],
  },
];

// Placeholder clip (no real Kamikochi footage available) — a short "上高地"
// title card generated with ffmpeg, see the commit that added it.
const VIDEO_FILES = ["kamikochi.webm"];
const SEED_PASSWORD = "password123";

// Demo "tourist" accounts with varied nationality/birth year, used only to
// populate GET /reels/mine/demographics with realistic-looking data on first
// look — see the ReelView seeding loop below.
const DEMO_VIEWERS = [
  { name: "Emily Carter", email: "viewer-us1@example.com", nationality: "usa", birthYear: 1994 },
  { name: "Wei Chen", email: "viewer-cn1@example.com", nationality: "china", birthYear: 1988 },
  { name: "Min-jun Kim", email: "viewer-kr1@example.com", nationality: "south_korea", birthYear: 2001 },
  { name: "Hana Lin", email: "viewer-tw1@example.com", nationality: "taiwan", birthYear: 1975 },
  { name: "田中太郎", email: "viewer-jp1@example.com", nationality: "japan", birthYear: 1990 },
  { name: "Somchai P.", email: "viewer-th1@example.com", nationality: "thailand", birthYear: 1983 },
];

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
  const allReelIds: string[] = [];

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
            nearestStationName: m.nearestStationName,
            nearestStationLat: m.nearestStationLat,
            nearestStationLng: m.nearestStationLng,
          },
        },
      },
      include: { municipality: true },
    });
    const municipalityId = user.municipality!.id;

    for (const r of m.reels) {
      const videoUrl = copySeedVideo(VIDEO_FILES[clipIndex % VIDEO_FILES.length]);
      clipIndex++;
      const reel = await prisma.reel.create({
        data: {
          municipalityId,
          videoUrl,
          caption: r.caption,
          category: r.category,
          locationName: r.locationName,
          locationLat: r.lat,
          locationLng: r.lng,
        },
      });
      allReelIds.push(reel.id);
    }
  }

  // Demo viewers + reel views, so GET /reels/mine/demographics has realistic
  // data to show right after a fresh deploy instead of an empty audience tab.
  const viewerUsers = await Promise.all(
    DEMO_VIEWERS.map((v) =>
      prisma.user.create({
        data: {
          email: v.email,
          passwordHash,
          name: v.name,
          role: "USER",
          nationality: v.nationality,
          birthYear: v.birthYear,
        },
      })
    )
  );

  for (const reelId of allReelIds) {
    const viewCount = Math.floor(Math.random() * 40) + 10;
    const rows = Array.from({ length: viewCount }, () => {
      // ~60% of views are attributable to a signed-in demo viewer, the rest
      // simulate logged-out visitors (viewerId null).
      const viewer = Math.random() < 0.6 ? viewerUsers[Math.floor(Math.random() * viewerUsers.length)] : null;
      return { reelId, viewerId: viewer?.id ?? null };
    });
    await prisma.reelView.createMany({ data: rows });
    await prisma.reel.update({ where: { id: reelId }, data: { viewCount } });
  }

  console.log(`[seed] Done. Demo account "demo-matsumoto@example.com" uses password "${SEED_PASSWORD}".`);
}
