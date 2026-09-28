import path from "node:path";
import type { DbHandle } from "./client";

/** Applies checked-in SQL migrations from ./drizzle (idempotent). */
export async function runMigrations(handle: DbHandle, folder = path.resolve(process.cwd(), "drizzle")) {
  if (handle.driver === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-specific db type
    await migrate(handle.db as any, { migrationsFolder: folder });
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-specific db type
    await migrate(handle.db as any, { migrationsFolder: folder });
  }
}
