import path from "path";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { locateTourismSpot } from "./lib/locateTourismSpot";

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
  tourismSpots: { name: string; description: string; locationLat?: number; locationLng?: number }[];
  accessInfo: string;
  lodgingInfo: string;
  restaurantInfo: string;
  // Reference point for the built-in access planner (see maasProvider.ts) —
  // real coordinates so "アクセスを調べる" returns a genuine walking/driving
  // estimate instead of falling back to an ungeocoded municipality.
  nearestStationName: string;
  nearestStationLat: number;
  nearestStationLng: number;
  reels: { caption: string; locationName: string; lat: number; lng: number; category: string; video: string; tags: string[]; bestMonths?: number[] }[];
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
    tourismSpots: [
      {
        name: "河童橋",
        // Same point as the 河童橋 post below. 大正池 has no hard-coded
        // coordinates (none verified); it's looked up at seed time when Google
        // Maps is configured, and otherwise just has no location.
        locationLat: 36.251,
        locationLng: 137.6389,
        description: "上高地のシンボルとなっている木製の吊り橋。橋の上から穂高連峰を一望できます。例年4月中旬〜11月中旬が開山期間で、冬期は閉鎖されます。",
      },
      {
        name: "大正池",
        description: "1915年の焼岳の噴火でできた池。立ち枯れた木々と穂高連峰が水面に映る、上高地を代表する撮影スポットです。",
      },
    ],
    accessInfo:
      "上高地は通年マイカー規制のため、車は松本ICから沢渡（さわんど）駐車場までで、その先はシャトルバスかタクシーに乗り換えが必要です。松本駅からは、アルピコ交通上高地線で新島々駅まで約30分、そこから路線バスで上高地バスターミナルまで約1時間です。",
    lodgingInfo: "上高地帝国ホテルや上高地温泉ホテルなど、梓川沿いの山岳リゾートホテルが点在しています。",
    restaurantInfo: "河童橋周辺には信州そばや岩魚料理を提供する食堂・カフェが並びます。",
    nearestStationName: "松本駅",
    // Coordinates per Wikipedia (松本駅 36.2305, 137.9639; 松本城 36.2391, 137.9691).
    nearestStationLat: 36.2305,
    nearestStationLng: 137.9639,
    // Only subjective "who it suits" tags here. barrierFree / multilingual are
    // factual claims about real facilities that haven't been verified, and a
    // wrong barrier-free tag could genuinely mislead someone, so the seed
    // leaves those for the municipality to set.
    reels: [
      { caption: "国宝 松本城。現存する五重六階の天守としては日本最古です。", locationName: "松本城", lat: 36.2391, lng: 137.9691, category: "culture", video: "matsumotojo.webm", tags: ["familyFriendly", "friends"], bestMonths: [4] },
      { caption: "河童橋から望む穂高連峰は圧巻です。", locationName: "上高地 河童橋", lat: 36.251, lng: 137.6389, category: "nature", video: "kamikochi.webm", tags: ["familyFriendly", "couples", "friends"], bestMonths: [5, 6, 10] },
      { caption: "河童橋を眺めながら信州そばのランチはいかが？", locationName: "五千尺キッチン", lat: 36.2508, lng: 137.6387, category: "restaurant", video: "gosenjaku.webm", tags: ["couples", "friends"] },
      { caption: "大正池のほとりに佇む、上高地を代表するクラシックホテルです。", locationName: "上高地帝国ホテル", lat: 36.2427, lng: 137.6284, category: "lodging", video: "teikoku.webm", tags: ["couples"] },
    ],
  },
];

// Each reel's `video` is a placeholder clip in seed-assets/ (no real footage
// available) — an 8-second animated illustration of the spot, drawn on a
// canvas and encoded with ffmpeg by seed-assets/source/render.mjs.
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
            accessInfo: m.accessInfo,
            lodgingInfo: m.lodgingInfo,
            restaurantInfo: m.restaurantInfo,
            nearestStationName: m.nearestStationName,
            nearestStationLat: m.nearestStationLat,
            nearestStationLng: m.nearestStationLng,
            tourismSpots: { create: m.tourismSpots },
          },
        },
      },
      include: { municipality: true },
    });
    const municipalityId = user.municipality!.id;

    for (const spot of await prisma.tourismSpot.findMany({ where: { municipalityId, locationLat: null } })) {
      const coords = await locateTourismSpot(spot.name, m.name);
      if (coords) await prisma.tourismSpot.update({ where: { id: spot.id }, data: coords });
    }

    for (const r of m.reels) {
      const videoUrl = copySeedVideo(r.video);
      const reel = await prisma.reel.create({
        data: {
          municipalityId,
          videoUrl,
          caption: r.caption,
          category: r.category,
          travelerTags: r.tags.join(","),
          bestMonths: (r.bestMonths ?? []).join(","),
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
