// The Express app (routes, static frontend, error handler) without starting a
// server — index.ts seeds and listens; tests mount it on a random port.
import "./lib/asyncErrors";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { UPLOAD_DIR } from "./middleware/upload";
import authRoutes from "./routes/auth";
import municipalityRoutes from "./routes/municipalities";
import companyRoutes from "./routes/companies";
import reelRoutes from "./routes/reels";
import searchRoutes from "./routes/search";
import inquiryRoutes from "./routes/inquiries";
import notificationRoutes from "./routes/notifications";
import conciergeRoutes from "./routes/concierge";
import eventRoutes from "./routes/events";
import tripRoutes from "./routes/trips";
import pushRoutes from "./routes/push";
import { applyMeta, metaForPath } from "./lib/pageMeta";

const app = express();

// Render sits behind one reverse proxy, so without this req.ip would always
// be the proxy's address instead of the real client's — needed for the
// IP-based nationality suggestion (geoLookup.ts) and per-IP rate limits
// (middleware/rateLimit.ts). Trust exactly one hop rather than `true`:
// trusting every hop would let a client fake its IP with an X-Forwarded-For
// header and dodge the rate limits. Override with TRUST_PROXY_HOPS if the
// deployment adds another proxy (e.g. a CDN) in front.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.resolve(UPLOAD_DIR)));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/municipalities", municipalityRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/reels", reelRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/concierge", conciergeRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/push", pushRoutes);

// Serve the built frontend (frontend/npm run build -> frontend/dist) so a single
// backend process can host both the API and the SPA, e.g. one Render web service.
// In local dev this directory doesn't exist — the Vite dev server handles the
// frontend instead, so these middlewares simply no-op.
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false }));
  const indexHtml = fs.readFileSync(path.join(frontendDist, "index.html"), "utf8");
  app.get(/^(?!\/api|\/uploads).*/, async (req, res) => {
    // Shared post/profile links get their own title and description for
    // link previews (lib/pageMeta.ts); everything else is the plain shell.
    const meta = await metaForPath(req.path, `${req.protocol}://${req.get("host")}`).catch(() => null);
    res.type("html").send(meta ? applyMeta(indexHtml, meta) : indexHtml);
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.status || 500).json({ error: err?.message || "サーバーエラーが発生しました" });
});

export default app;
