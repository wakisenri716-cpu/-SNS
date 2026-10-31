// The スタンプ帳 as a story-sized image (1080×1920) to share on Instagram,
// LINE and so on: the Jaziba logo, the traveler's stats and their most recent
// stamps drawn like the in-app ones.

const W = 1080;
const H = 1920;
const RED = "#d7202e";
const INK = "#11151d";
const MAX_STAMPS = 9;

export interface StampCardText {
  title: string;
  stats: string;
  more: (count: number) => string;
  footer: string;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Largest font size (down to `min`) at which `text` fits `maxWidth`, then
// truncated with "…" if it still doesn't.
export function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, maxWidth: number, family: string) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2) + "…";
  return out;
}

function drawStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, place: string, date: string, family: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = r * 0.075;
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = r * 0.028;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${r * 0.15}px ${family}`;
  ctx.letterSpacing = `${r * 0.03}px`;
  ctx.fillText("JAZIBA", 0, -r * 0.36);
  ctx.letterSpacing = "0px";
  ctx.fillText(fitText(ctx, place, 800, r * 0.24, r * 0.13, r * 1.36, family), 0, 0);
  ctx.font = `700 ${r * 0.13}px ${family}`;
  ctx.fillText(date, 0, r * 0.36);
  ctx.restore();
}

export async function renderStampCard(stamps: { place: string; date: string }[], text: StampCardText): Promise<Blob> {
  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Paper, with a thin red frame.
  ctx.fillStyle = "#fbf8f3";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  // The logo exactly as provided, scaled to fit.
  try {
    const logo = await loadImage("/brand/jaziba-logo.png");
    const h = 120;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, (W - w) / 2, 150, w, h);
  } catch {
    // No logo is better than no image at all.
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.fillText(fitText(ctx, text.title, 800, 68, 40, W - 200, family), W / 2, 400);
  ctx.fillStyle = "#646c7b";
  ctx.font = `600 40px ${family}`;
  ctx.fillText(text.stats, W / 2, 470);

  // Fewer stamps are drawn bigger; rows are centered in the space between
  // the header and the footer (a short last row too).
  const shown = stamps.slice(0, MAX_STAMPS);
  const cols = shown.length <= 1 ? 1 : shown.length <= 4 ? 2 : 3;
  const r = cols === 1 ? 230 : cols === 2 ? 190 : 140;
  const cellW = (W - 160) / cols;
  const rowH = r * 2 + 50;
  const rows = Math.ceil(shown.length / cols);
  const areaTop = 540;
  const areaBottom = stamps.length > MAX_STAMPS ? 1560 : 1620;
  const top = areaTop + (areaBottom - areaTop - rows * rowH) / 2;
  shown.forEach((s, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, shown.length - row * cols);
    const col = i % cols;
    const x = W / 2 + (col - (inRow - 1) / 2) * cellW;
    // A fixed per-position tilt, so stamps look hand-pressed but the card is stable.
    const angle = ((((i * 37) % 23) - 14) * Math.PI) / 180;
    drawStamp(ctx, x, top + row * rowH + rowH / 2, r, angle, s.place, s.date, family);
  });
  if (stamps.length > MAX_STAMPS) {
    ctx.fillStyle = RED;
    ctx.font = `800 44px ${family}`;
    ctx.textAlign = "center";
    ctx.fillText(text.more(stamps.length - MAX_STAMPS), W / 2, 1620);
  }

  // Footer: a red dot, then the line.
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(W / 2, H - 230, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `700 40px ${family}`;
  ctx.textAlign = "center";
  ctx.fillText(text.footer, W / 2, H - 160);
  ctx.fillStyle = "#646c7b";
  ctx.font = `500 32px ${family}`;
  ctx.fillText(window.location.host, W / 2, H - 110);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

// Share the image where the browser can share files (phones), otherwise save it.
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<"shared" | "cancelled" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
