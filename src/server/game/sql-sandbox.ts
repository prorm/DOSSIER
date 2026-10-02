import { createRequire } from "node:module";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { SqlResult } from "./primitives/types";

/**
 * Per-team SQL sandboxes. Each (event, team, node) gets its own in-memory
 * PGlite database, loaded with that team's procedurally generated data, living
 * in a worker thread so a runaway query can be killed without stalling the
 * game server. Queries run in READ ONLY transactions, one statement at a time,
 * with a hard timeout, a row cap and a statement guard. The database contains
 * only synthetic data; nothing in it is shared between teams.
 */

const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  try {
    const { PGlite } = require(workerData.pglite);
    const db = new PGlite();
    await db.exec(workerData.schema);
    await db.exec(workerData.data);
    parentPort.postMessage({ ready: true });
    parentPort.on("message", async (m) => {
      const t0 = Date.now();
      try {
        await db.exec("BEGIN READ ONLY");
        const r = await db.query(m.sql, [], { rowMode: "array" });
        await db.exec("ROLLBACK");
        const rows = r.rows.slice(0, m.maxRows).map((row) => row.map((v) => (v === null || typeof v === "number" || typeof v === "boolean") ? v : String(v).slice(0, 500)));
        parentPort.postMessage({ id: m.id, columns: r.fields.map((f) => f.name), rows, rowCount: r.rows.length, truncated: r.rows.length > m.maxRows, ms: Date.now() - t0 });
      } catch (e) {
        try { await db.exec("ROLLBACK"); } catch {}
        parentPort.postMessage({ id: m.id, error: String((e && e.message) || e).split("\\n")[0].slice(0, 300) });
      }
    });
  } catch (e) {
    parentPort.postMessage({ fatal: String((e && e.message) || e) });
  }
})();`;

export class SqlError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid" | "timeout" | "unavailable",
  ) {
    super(message);
    this.name = "SqlError";
  }
}

interface Slot {
  worker: Worker;
  ready: Promise<void>;
  pending: Map<number, { resolve: (r: SqlResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  lastUsed: number;
}

const g = globalThis as unknown as { __dossierSql?: Map<string, Slot>; __dossierSqlSeq?: number };
const slots = (g.__dossierSql ??= new Map());

const MAX_SLOTS = Number(process.env.SQL_SANDBOX_MAX ?? 8);
const TIMEOUT_MS = Number(process.env.SQL_SANDBOX_TIMEOUT_MS ?? 3000);
const MAX_ROWS = 200;
const MAX_SQL = 4000;

let pglitePath: string | null = null;
function resolvePglite() {
  pglitePath ??= createRequire(path.join(process.cwd(), "package.json")).resolve("@electric-sql/pglite");
  return pglitePath;
}

const DENY = /\b(pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink|copy|set_config|pg_terminate_backend|pg_cancel_backend|vacuum|listen|notify)\b/i;

/** Statement guard: a single read-only statement. Defence in depth — the transaction is READ ONLY regardless. */
export function guardSql(sql: string): string {
  const s = sql.trim().replace(/;\s*$/, "");
  if (!s) throw new SqlError("Enter a query.", "invalid");
  if (s.length > MAX_SQL) throw new SqlError(`Queries are limited to ${MAX_SQL} characters.`, "invalid");
  const stripped = s.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!/^(select|with|explain|values|table)\b/i.test(stripped)) throw new SqlError("Only read queries (SELECT / WITH / EXPLAIN) are allowed.", "invalid");
  if (DENY.test(stripped)) throw new SqlError("That function is not available in the sandbox.", "invalid");
  if (stripped.includes(";")) throw new SqlError("One statement at a time.", "invalid");
  return s;
}

function evict() {
  while (slots.size >= MAX_SLOTS) {
    const oldest = [...slots.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (!oldest) return;
    void oldest[1].worker.terminate();
    slots.delete(oldest[0]);
  }
}

function spawn(key: string, dataset: { schema: string; data: string }): Slot {
  evict();
  const worker = new Worker(WORKER_SRC, { eval: true, workerData: { pglite: resolvePglite(), ...dataset }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
  worker.unref();
  const pending: Slot["pending"] = new Map();
  let markReady!: () => void;
  let fail!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => {
    markReady = res;
    fail = rej;
  });
  worker.on("message", (m: { ready?: boolean; fatal?: string; id?: number; error?: string } & Partial<SqlResult>) => {
    if (m.ready) return markReady();
    if (m.fatal) return fail(new SqlError(`Sandbox failed to start: ${m.fatal}`, "unavailable"));
    const p = m.id !== undefined ? pending.get(m.id) : undefined;
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id!);
    if (m.error) p.reject(new SqlError(m.error, "invalid"));
    else p.resolve({ columns: m.columns!, rows: m.rows!, rowCount: m.rowCount!, truncated: m.truncated!, ms: m.ms! });
  });
  const kill = (err: Error) => {
    fail(err);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
    if (slots.get(key)?.worker === worker) slots.delete(key);
  };
  worker.on("error", (e: Error) => kill(new SqlError(`Sandbox error: ${e.message}`, "unavailable")));
  worker.on("exit", () => kill(new SqlError("Sandbox restarted.", "unavailable")));
  const slot: Slot = { worker, ready, pending, lastUsed: Date.now() };
  slots.set(key, slot);
  return slot;
}

export async function runSandboxQuery(key: string, dataset: () => { schema: string; data: string }, sql: string): Promise<SqlResult> {
  const statement = guardSql(sql);
  let slot = slots.get(key);
  if (!slot) slot = spawn(key, dataset());
  slot.lastUsed = Date.now();
  await slot.ready;
  const id = (g.__dossierSqlSeq = (g.__dossierSqlSeq ?? 0) + 1);
  const s = slot;
  return new Promise<SqlResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      s.pending.delete(id);
      // A query that outlives the budget takes the whole worker down; it is re-created on next use.
      void s.worker.terminate();
      if (slots.get(key) === s) slots.delete(key);
      reject(new SqlError(`Query exceeded ${TIMEOUT_MS / 1000}s and was cancelled.`, "timeout"));
    }, TIMEOUT_MS);
    s.pending.set(id, { resolve, reject, timer });
    s.worker.postMessage({ id, sql: statement, maxRows: MAX_ROWS });
  });
}

export async function closeAllSandboxes() {
  await Promise.all([...slots.values()].map((s) => s.worker.terminate()));
  slots.clear();
}
