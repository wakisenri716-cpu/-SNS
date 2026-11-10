import { gzipSync } from "node:zlib";
import type { Request, Response } from "express";

// A large JSON answer, gzipped when the browser accepts it (the full
// municipality list is about 600KB raw, about 100KB gzipped). Only for
// one-shot answers; the live streams (SSE) must stay uncompressed.
export function sendJsonGzipped(req: Request, res: Response, body: unknown) {
  const json = Buffer.from(JSON.stringify(body));
  res.setHeader("Vary", "Accept-Encoding");
  res.type("application/json");
  if (json.length > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    res.setHeader("Content-Encoding", "gzip");
    res.send(gzipSync(json));
  } else res.send(json);
}
