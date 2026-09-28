import "./_env";
import path from "node:path";
import { createDb, setDbHandle } from "../src/server/db/client";
import { formatIssue, loadPack } from "../src/server/packs/load";
import { importPack } from "../src/server/packs/import";

/** Usage: pnpm pack:import <slug> [--no-activate] */
async function main() {
  const slug = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : process.env.ACTIVE_PACK;
  if (!slug) throw new Error("usage: pnpm pack:import <slug>");
  const { pack, issues } = await loadPack(path.resolve(process.env.PACKS_DIR ?? "packs"), slug);
  for (const i of issues) console.log(formatIssue(i));
  if (!pack) process.exit(1);
  const handle = await createDb(process.env.DATABASE_URL!);
  setDbHandle(handle);
  const s = await importPack(handle.db, pack, { activate: !process.argv.includes("--no-activate") });
  console.log(
    `✔ imported ${s.eventId}: ${s.challenges} challenges, ${s.checkpoints} checkpoints, pruned ${s.pruned}, hidden ${s.hidden}${s.activated ? " (active)" : ""}`,
  );
  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
