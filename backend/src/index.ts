import "dotenv/config";
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
import { seedIfEmpty } from "./seed";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

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

// Serve the built frontend (frontend/npm run build -> frontend/dist) so a single
// backend process can host both the API and the SPA, e.g. one Render web service.
// In local dev this directory doesn't exist — the Vite dev server handles the
// frontend instead, so these middlewares simply no-op.
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.status || 500).json({ error: err?.message || "サーバーエラーが発生しました" });
});

seedIfEmpty()
  .catch((err) => console.error("[seed] failed:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Tourism SNS backend listening on http://localhost:${PORT}`);
    });
  });
