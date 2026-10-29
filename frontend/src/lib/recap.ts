import { fitText, loadImage } from "./stampCard";

// 旅の振り返り (see pages/RecapPage.tsx and GET /api/me/recap).

interface RecapPlace {
  id: string;
  name: string;
  prefecture: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  at: string;
}

export interface Recap {
  year: number;
  saved: { count: number; prefectures: string[]; first: RecapPlace | null; places: RecapPlace[] };
  stamps: { count: number; prefectures: string[]; places: RecapPlace[] };
  trips: { count: number; biggest: { id: string; name: string } | null };
  likes: number;
  comments: number;
  follows: number;
  months: number[];
  busiestMonth: number | null;
  topCategory: { category: string; count: number } | null;
  topMunicipality: { id: string; name: string; prefecture: string; count: number } | null;
}

export type Persona = "nature" | "culture" | "activity" | "lodging" | "restaurant" | "explorer";

// The traveler "type", from the kind of place they saved and visited most.
export function personaOf(r: Pick<Recap, "topCategory">): Persona {
  const c = r.topCategory?.category;
  return c === "nature" || c === "culture" || c === "activity" || c === "lodging" || c === "restaurant" ? c : "explorer";
}

export interface RecapCardText {
  title: string;
  persona: string;
  saved: string;
  prefectures: string;
  stamps: string;
  likes: string;
  topTown: string;
  footer: string;
}

const W = 1080;
const H = 1920;

// A story-sized (1080×1920) summary image to share.
export async function renderRecapCard(r: Recap, text: RecapCardText): Promise<Blob> {
  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#d7202e");
  bg.addColorStop(0.55, "#ff7a4d");
  bg.addColorStop(1, "#ff4f8b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // White panel with the logo exactly as provided.
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRect(ctx, 80, 120, W - 160, 230, 48);
  ctx.fill();
  try {
    const logo = await loadImage("/brand/jaziba-logo.png");
    const h = 110;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, (W - w) / 2, 180, w, h);
  } catch {
    // No logo is better than no image at all.
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = `900 220px ${family}`;
  ctx.fillText(String(r.year), W / 2, 640);
  ctx.fillText(fitText(ctx, text.title, 800, 60, 36, W - 200, family), W / 2, 740);
  ctx.fillText(fitText(ctx, text.persona, 900, 96, 48, W - 160, family), W / 2, 900);

  const cells: [number, string][] = [
    [r.saved.count, text.saved],
    [r.saved.prefectures.length, text.prefectures],
    [r.stamps.count, text.stamps],
    [r.likes, text.likes],
  ];
  const cellW = (W - 160 - 40) / 2;
  const cellH = 250;
  cells.forEach(([n, label], i) => {
    const x = 80 + (i % 2) * (cellW + 40);
    const y = 1000 + Math.floor(i / 2) * (cellH + 40);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(ctx, x, y, cellW, cellH, 40);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 120px ${family}`;
    ctx.fillText(String(n), x + cellW / 2, y + 145);
    ctx.fillText(fitText(ctx, label, 700, 40, 26, cellW - 40, family), x + cellW / 2, y + 210);
  });
  if (text.topTown) ctx.fillText(fitText(ctx, text.topTown, 700, 48, 30, W - 200, family), W / 2, 1640);
  ctx.globalAlpha = 0.85;
  ctx.fillText(fitText(ctx, text.footer, 600, 36, 24, W - 200, family), W / 2, 1790);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
