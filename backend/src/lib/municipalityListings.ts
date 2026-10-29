import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { NAGANO_MUNICIPALITIES } from "../data/naganoMunicipalities";

const PREFECTURE = "長野県";

// 長野県の全市町村を掲載: a page for every municipality in Nagano, built from
// public data (see src/data/naganoMunicipalities.ts), so travelers can find
// each town and its main sights before the town itself joins Jaziba.
//
// A municipality that hasn't joined gets a `listing` page: its account has
// an unguessable random password and a reserved .invalid address, so no one
// can sign in as it, it has no posts, and its profile says it hasn't joined.
// One that already exists (joined, or made earlier) only gets the public
// fields it lacks — its own text and spots are never overwritten. Jaziba's
// own demo accounts (demo-*@example.com) also get the missing sights.
//
// Runs at every start-up; once all are present it's a single count query.
export async function syncMunicipalityListings() {
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
