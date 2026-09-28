import "./_env";
import { createDb, setDbHandle } from "../src/server/db/client";
import { createStaff } from "../src/server/auth/accounts";
import { SYSTEM_ACTOR } from "../src/server/audit";

/** Usage: pnpm staff:create <email> <owner|admin|volunteer> <password> [name] */
async function main() {
  const [email, role, password, ...name] = process.argv.slice(2);
  if (!email || !role || !password || !["owner", "admin", "volunteer"].includes(role)) {
    throw new Error("usage: pnpm staff:create <email> <owner|admin|volunteer> <password> [name]");
  }
  const handle = await createDb(process.env.DATABASE_URL!);
  setDbHandle(handle);
  const s = await createStaff(
    handle.db,
    { email, role: role as "owner" | "admin" | "volunteer", password, name: name.join(" ") || email.split("@")[0]! },
    SYSTEM_ACTOR,
  );
  console.log(`✔ created ${s.role} ${s.email}`);
  await handle.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
