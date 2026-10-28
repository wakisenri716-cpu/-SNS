import "dotenv/config";
import app from "./app";
import { seedIfEmpty } from "./seed";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

seedIfEmpty()
  .catch((err) => console.error("[seed] failed:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Tourism SNS backend listening on http://localhost:${PORT}`);
    });
  });
