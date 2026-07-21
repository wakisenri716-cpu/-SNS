import "dotenv/config";
import { seedIfEmpty } from "./seed";

seedIfEmpty()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
