import "./_env";
import { createDb } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const handle = await createDb(url);
  await runMigrations(handle);
  console.log("✔ migrations applied");
  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
