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

export { UPLOAD_DIR };
