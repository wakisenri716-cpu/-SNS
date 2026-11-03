import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : "";
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

// A wrong file type is the client's mistake: 400 with a message the app shows.
function onlyTypes(allowed: Set<string>, message: string): multer.Options["fileFilter"] {
  return (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      cb(Object.assign(new Error(message), { status: 400 }));
      return;
    }
    cb(null, true);
  };
}

// Reel videos.
export const uploadVideo = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB, dev-only local storage
  fileFilter: onlyTypes(VIDEO_MIME, "動画ファイル（MP4・MOV・WebM）を選んでください"),
});

// Avatars: images only, and much smaller.
export const uploadImage = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: onlyTypes(IMAGE_MIME, "画像ファイル（JPEG・PNG・WebP）を選んでください"),
});

// 素材の提供: a traveler's photo or video (videos up to the reel limit).
export const uploadMedia = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: onlyTypes(new Set([...VIDEO_MIME, ...IMAGE_MIME]), "写真（JPEG・PNG・WebP）か動画（MP4・MOV・WebM）を選んでください"),
});

// 地元の交通情報: a screenshot or a PDF of the town's transport information.
export const TRANSIT_FILE_MIME = new Set([...IMAGE_MIME, "application/pdf"]);
const TRANSIT_FILE_ERROR = "画像（JPEG・PNG・WebP）かPDFを選んでください";
export const uploadTransitFile = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: onlyTypes(TRANSIT_FILE_MIME, TRANSIT_FILE_ERROR),
});
// For the AI's reading only: kept in memory, never saved.
export const readTransitFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: onlyTypes(TRANSIT_FILE_MIME, TRANSIT_FILE_ERROR),
});

export const isVideoMime = (mime: string) => VIDEO_MIME.has(mime);

export { UPLOAD_DIR };
