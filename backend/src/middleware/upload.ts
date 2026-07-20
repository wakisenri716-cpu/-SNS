import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : "";
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB, dev-only local storage
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("対応していないファイル形式です"));
      return;
    }
    cb(null, true);
  },
});

export { UPLOAD_DIR };
