import { prisma } from "../prisma";

// Link previews for shared posts and profiles. The frontend is a single-page
// app, so crawlers (LINE, X, Facebook, Slack...) that don't run JavaScript
// would only ever see the generic title. For these URLs the server fills the
// page's title / description / og:* tags with the real post or profile
// before sending index.html.

interface PageMeta {
  title: string;
  description: string;
  url: string;
  type: "website" | "article";
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clip(s: string, max: number) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function metaForPath(pathname: string, origin: string): Promise<PageMeta | null> {
  const reelMatch = pathname.match(/^\/reels\/([^/]+)\/access\/?$/);
  if (reelMatch) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelMatch[1] },
      select: { caption: true, locationName: true, municipality: { select: { name: true, prefecture: true } }, company: { select: { name: true } } },
    });
    if (!reel) return null;
    const place = reel.locationName || reel.municipality.name;
    return {
      title: `${place}（${reel.municipality.prefecture}${reel.municipality.name}）| ジャジバ`,
      description: clip(reel.caption || `${reel.company?.name ?? reel.municipality.name}の投稿。行き方・宿・飲食店の情報もジャジバで。`, 120),
      url: `${origin}${pathname}`,
      type: "article",
    };
  }
  const muniMatch = pathname.match(/^\/municipalities\/([^/]+)\/?$/);
  if (muniMatch) {
    const m = await prisma.municipality.findUnique({
      where: { id: muniMatch[1] },
      select: { name: true, prefecture: true, description: true },
    });
    if (!m) return null;
    return {
      title: `${m.name}（${m.prefecture}）の観光動画 | ジャジバ`,
      description: clip(m.description || `${m.name}の名所・宿・グルメの動画と行き方をジャジバで。`, 120),
      url: `${origin}${pathname}`,
      type: "website",
    };
  }
  const tripMatch = pathname.match(/^\/trip\/([^/]+)\/?$/);
  if (tripMatch) {
    const trip = await prisma.trip.findUnique({
      where: { shareToken: tripMatch[1] },
      select: {
        name: true,
        user: { select: { name: true } },
        items: {
          where: { reel: { locationLat: { not: null }, locationLng: { not: null } } },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { reel: { select: { locationName: true, municipality: { select: { name: true } } } } },
        },
      },
    });
    if (!trip) return null;
    const names = trip.items.map((s) => s.reel.locationName || s.reel.municipality.name);
    return {
      title: `${trip.user.name}さんの「${trip.name}」（${names.length}か所）| ジャジバ`,
      description: clip(names.join(" → ") || "ジャジバで作った旅のしおり", 120),
      url: `${origin}${pathname}`,
      type: "article",
    };
  }
  return null;
}

export function applyMeta(html: string, meta: PageMeta) {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escapeHtml(meta.url)}$2`)
    .replace(/(<meta\s+property="og:type"\s+content=")[^"]*(")/, `$1${meta.type}$2`);
}
