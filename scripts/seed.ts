import "./_env";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, setDbHandle } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { staffUsers } from "../src/server/db/schema";
import { createStaff, generateTempPassword } from "../src/server/auth/accounts";
import { SYSTEM_ACTOR } from "../src/server/audit";
import { formatIssue, loadPack } from "../src/server/packs/load";
import { importPack } from "../src/server/packs/import";

/**
 * Idempotent seed: migrations → import ACTIVE_PACK → ensure an owner account.
 * Owner credentials come from SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD; if the
 * password is not provided a random one is generated and printed ONCE.
 */
export async function seed() {
  const handle = await createDb(process.env.DATABASE_URL!);
  setDbHandle(handle);
  await runMigrations(handle);
  const slug = process.env.ACTIVE_PACK;
  if (slug) {
    const { pack, issues } = await loadPack(path.resolve(process.env.PACKS_DIR ?? "packs"), slug);
    issues.forEach((i) => console.log(formatIssue(i)));
    if (!pack) throw new Error(`pack ${slug} is invalid`);
    const s = await importPack(handle.db, pack);
    console.log(`✔ pack ${s.eventId}: ${s.challenges} challenges, ${s.checkpoints} checkpoints`);
  } else console.log("• ACTIVE_PACK not set — skipping pack import");

  const email = (process.env.SEED_OWNER_EMAIL ?? "owner@dossier.local").toLowerCase();
  const [existing] = await handle.db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
  if (!existing) {
    const password = process.env.SEED_OWNER_PASSWORD ?? generateTempPassword(16);
    await createStaff(handle.db, { email, name: "Event Owner", role: "owner", password }, SYSTEM_ACTOR);
    console.log(`✔ owner account ${email}${process.env.SEED_OWNER_PASSWORD ? "" : ` — password: ${password}  (shown once; change it)`}`);
  } else console.log(`• owner ${email} exists`);
  return handle;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts")) {
  seed()
    .then((h) => h.close())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
