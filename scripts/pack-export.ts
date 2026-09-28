import "./_env";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, setDbHandle } from "../src/server/db/client";
import { events } from "../src/server/db/schema";
import { exportPack } from "../src/server/packs/export";

/** Usage: pnpm pack:export <eventId> [outDir] */
async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("usage: pnpm pack:export <eventId> [outDir]");
  const out = path.resolve(process.argv[3] ?? `packs-export/${id}`);
  const handle = await createDb(process.env.DATABASE_URL!);
  setDbHandle(handle);
  const [event] = await handle.db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) throw new Error(`event ${id} not found`);
  const files = await exportPack(handle.db, event);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(out, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  }
  console.log(`✔ exported ${Object.keys(files).length} files to ${out} (copy assets/ from the original pack)`);
  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
