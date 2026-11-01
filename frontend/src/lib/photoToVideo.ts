// A traveler's photo as a short vertical clip, so it can be posted as a reel:
// the photo fills a 9:16 frame and slowly zooms in (a Ken Burns move), drawn
// on a canvas and recorded with MediaRecorder — on the municipality's device,
// with no server-side video tools. MP4 where the browser records it (Safari),
// else WebM (Chrome, Firefox).

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

export function photoToVideoSupported() {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

function pickType() {
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** Where to draw a `w`×`h` image so it covers the frame, zoomed by `zoom` (≥1), centered. */
export function coverRect(w: number, h: number, frameW: number, frameH: number, zoom: number) {
  const scale = Math.max(frameW / w, frameH / h) * zoom;
  const dw = w * scale;
  const dh = h * scale;
  return { x: (frameW - dw) / 2, y: (frameH - dh) / 2, w: dw, h: dh };
}

export async function photoToVideo(
  src: string,
  { seconds = 6, onProgress }: { seconds?: number; onProgress?: (fraction: number) => void } = {}
): Promise<File> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const draw = (t: number) => {
    // Ease in-out from 100% to 112%.
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const r = coverRect(img.naturalWidth, img.naturalHeight, WIDTH, HEIGHT, 1 + 0.12 * e);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  };
  draw(0);

  const type = pickType();
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(250);

  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      draw(t);
      onProgress?.(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());

  const mp4 = (recorder.mimeType || type).startsWith("video/mp4");
  const blobType = mp4 ? "video/mp4" : "video/webm";
  return new File([new Blob(chunks, { type: blobType })], mp4 ? "photo.mp4" : "photo.webm", { type: blobType });
}
