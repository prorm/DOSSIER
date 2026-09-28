// Loads .env for CLI scripts (Next loads it automatically for the app).
import fs from "node:fs";

if (fs.existsSync(".env") && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* ignore */
  }
}
