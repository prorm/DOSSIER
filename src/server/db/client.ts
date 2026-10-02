import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

export interface DbHandle {
  db: DB;
  driver: "postgres" | "pglite";
  /** postgres-js client when driver = postgres (used for LISTEN/NOTIFY). */
  raw?: unknown;
  close: () => Promise<void>;
}

const g = globalThis as unknown as { __dossierDb?: DbHandle; __dossierDbPromise?: Promise<DbHandle> };

export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith("pglite://") || url.startsWith("memory://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = url.startsWith("memory://") ? undefined : url.slice("pglite://".length);
    if (dir) {
      const fs = await import("node:fs");
      const path = await import("node:path");
      fs.mkdirSync(path.resolve(dir), { recursive: true });
    }
    const client = dir ? new PGlite(dir) : new PGlite();
    await client.waitReady;
    const db = drizzle(client, { schema }) as unknown as DB;
    return { db, driver: "pglite", raw: client, close: () => client.close() };
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 15), idle_timeout: 30, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as DB;
  return { db, driver: "postgres", raw: client, close: () => client.end({ timeout: 5 }) };
}

export async function getDbHandle(): Promise<DbHandle> {
  if (g.__dossierDb) return g.__dossierDb;
  if (!g.__dossierDbPromise) {
    g.__dossierDbPromise = createDb(env().DATABASE_URL)
      .then((h) => {
        g.__dossierDb = h;
        return h;
      })
      .catch((err) => {
        g.__dossierDbPromise = undefined;
        throw err;
      });
  }
  return g.__dossierDbPromise;
}

export async function getDb(): Promise<DB> {
  return (await getDbHandle()).db;
}

/** Test/CLI hook: install an explicit handle (e.g. an in-memory PGlite). */
export function setDbHandle(handle: DbHandle | undefined) {
  g.__dossierDb = handle;
  g.__dossierDbPromise = handle ? Promise.resolve(handle) : undefined;
}

export { schema };
