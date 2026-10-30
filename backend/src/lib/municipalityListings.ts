import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { NAGANO_MUNICIPALITIES, type ListingMunicipality, type ListingSpot } from "../data/naganoMunicipalities";

const PREFECTURE = "長野県";

// 長野県の全市町村を掲載: a page for every municipality in Nagano, built from
// public data (see src/data/naganoMunicipalities.ts), so travelers can find
// each town and its main sights before the town itself joins Jaziba.
//
// A municipality that hasn't joined gets a `listing` page: its account has
// an unguessable random password and a reserved .invalid address, so no one
// can sign in as it, its only posts are Jaziba's labelled introductions
// (below), and its profile says it hasn't joined.
// One that already exists (joined, or made earlier) only gets the public
// fields it lacks — its own text and spots are never overwritten. Jaziba's
// own demo accounts (demo-*@example.com) also get the missing sights.
//
// Runs at every start-up; once all are present it's a couple of count queries.
export async function syncMunicipalityListings() {
  await syncPages();
  await syncEditorialPosts();
}

async function syncPages() {
  const codes = NAGANO_MUNICIPALITIES.map((m) => m.lgCode);
  if ((await prisma.municipality.count({ where: { lgCode: { in: codes } } })) === codes.length) return;

  let created = 0;
  for (const m of NAGANO_MUNICIPALITIES) {
    const existing =
      (await prisma.municipality.findUnique({ where: { lgCode: m.lgCode }, include: { user: { select: { email: true } }, tourismSpots: true } })) ??
      (await prisma.municipality.findFirst({
        where: { name: m.name, prefecture: PREFECTURE },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { email: true } }, tourismSpots: true },
      }));

    if (existing) {
      await prisma.municipality.update({
        where: { id: existing.id },
        data: {
          lgCode: existing.lgCode ?? m.lgCode,
          kana: existing.kana || m.kana,
          websiteUrl: existing.websiteUrl || m.url,
          officeLat: existing.officeLat ?? m.lat,
          officeLng: existing.officeLng ?? m.lng,
        },
      });
      if (existing.listing || existing.user.email.startsWith("demo-")) {
        const have = new Set(existing.tourismSpots.map((s) => s.name));
        const missing = m.spots.filter((s) => !have.has(s.name));
        if (missing.length > 0) {
          await prisma.tourismSpot.createMany({
            data: missing.map((s) => ({ municipalityId: existing.id, name: s.name, description: s.description, locationLat: s.lat ?? null, locationLng: s.lng ?? null })),
          });
        }
      }
      continue;
    }

    await prisma.user.create({
      data: {
        email: `listing-${m.lgCode}@listing.jaziba.invalid`,
        // Random and thrown away: nobody can sign in to a listing.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 4),
        name: m.name,
        role: "MUNICIPALITY",
        municipality: {
          create: {
            name: m.name,
            prefecture: PREFECTURE,
            description: m.catchphrase,
            kana: m.kana,
            websiteUrl: m.url,
            lgCode: m.lgCode,
            officeLat: m.lat,
            officeLng: m.lng,
            listing: true,
            tourismSpots: {
              create: m.spots.map((s) => ({ name: s.name, description: s.description, locationLat: s.lat ?? null, locationLng: s.lng ?? null })),
            },
          },
        },
      },
    });
    created++;
  }
  if (created > 0) console.log(`[listings] Added ${created} municipality pages for ${PREFECTURE}`);
}

// ---- ジャジバ編集部の紹介投稿 -------------------------------------------------
//
// Each listing gets introduction posts — one per sight, or one about the town
// when it has none — so its page and the feed aren't empty. They are marked
// `editorial` and the app labels them as Jaziba's, never as the town's own
// posts. There's no real footage: each uses an illustrated clip of its kind
// of place (seed-assets/theme-*.webm), shared by all posts of that kind.
// Captions are the sight's description; positions only where the data has
// one. A listing that already has editorial posts is left alone.

type Theme = "onsen" | "shrine" | "castle" | "posttown" | "lake" | "gorge" | "highland" | "mountain" | "museum" | "town";

const THEME_RULES: [RegExp, Theme][] = [
  [/温泉|大湯|麻釜/, "onsen"],
  [/美術館|博物館|館$|ミュージアム|天文台|蚕糸|学校/, "museum"],
  [/城|五稜郭|懐古園|古戦場|古墳|遺跡/, "castle"],
  [/滝|渓谷|峡|床|渓|橋/, "gorge"],
  [/湖|池/, "lake"],
  [/宿$|町並み|寺町|銀座|平沢|ホテル|歌舞伎|市田柿|関所/, "posttown"],
  [/神社|大社|寺|院|塔|石仏/, "shrine"],
  [/岳|山|峠|尾根/, "mountain"],
  [/高原|棚田|農場|牧場|里|原/, "highland"],
  [/標$/, "town"],
];

export function themeOf(spot: Pick<ListingSpot, "name" | "description">): Theme {
  for (const [re, theme] of THEME_RULES) if (re.test(spot.name)) return theme;
  for (const [re, theme] of THEME_RULES) if (re.test(spot.description)) return theme;
  return "highland";
}

const CATEGORY: Record<Theme, string> = {
  onsen: "activity",
  shrine: "culture",
  castle: "culture",
  posttown: "culture",
  museum: "culture",
  town: "culture",
  lake: "nature",
  gorge: "nature",
  highland: "nature",
  mountain: "nature",
};

const SEED_ASSETS_DIR = path.resolve(__dirname, "../../seed-assets");

// One copy of each theme clip in the uploads folder, reused by every post of that kind.
function themeVideoUrl(theme: Theme) {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  const name = `seed-theme-${theme}.webm`;
  const dest = path.join(dir, name);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(SEED_ASSETS_DIR, `theme-${theme}.webm`), dest);
  }
  return `/uploads/${name}`;
}

interface EditorialPost {
  municipalityId: string;
  caption: string;
  locationName: string;
  lat: number | null;
  lng: number | null;
  theme: Theme;
}

function postsFor(municipalityId: string, m: ListingMunicipality): EditorialPost[] {
  if (m.spots.length === 0) {
    return [
      {
        municipalityId,
        caption: `長野県${m.name}（${m.kana}）。${m.catchphrase ? `キャッチフレーズは「${m.catchphrase}」。` : ""}観光の情報は公式サイトでどうぞ。`,
        locationName: m.name,
        lat: null,
        lng: null,
        theme: "town",
      },
    ];
  }
  return m.spots.map((spot) => ({
    municipalityId,
    caption: spot.description,
    locationName: spot.name,
    lat: spot.lat ?? null,
    lng: spot.lng ?? null,
    theme: themeOf(spot),
  }));
}

async function syncEditorialPosts() {
  const listings = await prisma.municipality.findMany({
    where: { listing: true, lgCode: { in: NAGANO_MUNICIPALITIES.map((m) => m.lgCode) }, reels: { none: { editorial: true } } },
    select: { id: true, lgCode: true },
  });
  if (listings.length === 0) return;
  const byCode = new Map(NAGANO_MUNICIPALITIES.map((m) => [m.lgCode, m]));
  const queues = listings.map((l) => postsFor(l.id, byCode.get(l.lgCode!)!));
  // Round-robin across towns, so the feed doesn't show one town's posts in a row.
  const ordered: EditorialPost[] = [];
  for (let i = 0; queues.some((q) => q.length > i); i++) for (const q of queues) if (q[i]) ordered.push(q[i]);
  const start = Date.now();
  await prisma.reel.createMany({
    data: ordered.map((p, i) => ({
      municipalityId: p.municipalityId,
      videoUrl: themeVideoUrl(p.theme),
      caption: p.caption,
      locationName: p.locationName,
      locationLat: p.lat,
      locationLng: p.lng,
      category: CATEGORY[p.theme],
      editorial: true,
      // Distinct times (all "just now"), each town's first and best-known sight newest.
      createdAt: new Date(start - i),
    })),
  });
  console.log(`[listings] Added ${ordered.length} editorial introductions for ${listings.length} municipalities`);
}
