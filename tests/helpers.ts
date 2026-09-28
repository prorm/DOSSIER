import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, setDbHandle, type DB, type DbHandle } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import { events, teams } from "../src/server/db/schema";
import { resetEnvCache } from "../src/server/env";
import { loadPack } from "../src/server/packs/load";
import { importPack } from "../src/server/packs/import";
import { createStaff, registerTeam, startTeamSession } from "../src/server/auth/accounts";
import { controlEvent } from "../src/server/engine/event";
import { SYSTEM_ACTOR } from "../src/server/audit";
import type { EventRow } from "../src/server/engine/types";
import { cookieName, createSession, csrfTokenFor, resolveStaffSession, resolveTeamSession } from "../src/server/auth/session";
import type { StaffRole } from "../src/server/db/schema";

export interface TestDb {
  handle: DbHandle;
  db: DB;
}

/**
 * Fresh database with all migrations applied. Defaults to in-memory PGlite
 * (real Postgres compiled to WASM). Set TEST_DATABASE_URL=postgres://… to run
 * the same suite against a real server: each test file gets its own database.
 */
export async function freshDb(): Promise<TestDb> {
  resetEnvCache();
  const pg = process.env.TEST_DATABASE_URL;
  let handle: DbHandle;
  if (pg) {
    const name = `dossier_t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const admin = await createDb(pg);
    await (admin.raw as { unsafe: (q: string) => Promise<unknown> }).unsafe(`CREATE DATABASE ${name}`);
    await admin.close();
    const u = new URL(pg);
    u.pathname = `/${name}`;
    handle = await createDb(u.toString());
  } else {
    handle = await createDb("memory://test");
  }
  await runMigrations(handle, path.resolve("drizzle"));
  setDbHandle(handle);
  return { handle, db: handle.db };
}

export async function importFixture(db: DB, slug: string, dir = "tests/fixtures/packs"): Promise<EventRow> {
  const { pack, issues } = await loadPack(path.resolve(dir), slug);
  if (!pack) throw new Error(`fixture ${slug} invalid: ${JSON.stringify(issues, null, 2)}`);
  await importPack(db, pack);
  return (await db.select().from(events).where(eq(events.id, slug)))[0]!;
}

export async function startEvent(db: DB, event: EventRow): Promise<EventRow> {
  return controlEvent(db, event, "start", SYSTEM_ACTOR);
}

export async function reloadEvent(db: DB, id: string): Promise<EventRow> {
  return (await db.select().from(events).where(eq(events.id, id)))[0]!;
}

let teamSeq = 0;
export async function makeTeam(db: DB, event: EventRow, name?: string, code = "") {
  teamSeq += 1;
  const teamName = name ?? `Team ${teamSeq} ${Math.random().toString(36).slice(2, 6)}`;
  return registerTeam(db, event, { teamName, password: "correct horse battery", members: [{ name: "Ada" }], affiliation: "", code }, `10.0.${teamSeq % 250}.1`);
}

export const ORIGIN = "http://localhost:3000";

/** Creates a real team session and returns the headers a browser would send. */
export async function teamHeaders(db: DB, teamId: string, extra: Record<string, string> = {}) {
  const { token } = await startTeamSession(db, teamId, "10.0.0.1", "vitest");
  const s = (await resolveTeamSession(db, token))!;
  return { cookie: `${cookieName("team")}=${token}`, origin: ORIGIN, "x-csrf-token": csrfTokenFor(s), "content-type": "application/json", ...extra };
}

let staffSeq = 0;
export async function staffHeaders(db: DB, role: StaffRole) {
  staffSeq += 1;
  const s = await createStaff(db, { email: `${role}${staffSeq}@test.local`, name: role, role, password: "staff-password-123" }, SYSTEM_ACTOR);
  const { token } = await createSession(db, { kind: "staff", staffId: s.id });
  const sess = (await resolveStaffSession(db, token))!;
  return { cookie: `${cookieName("staff")}=${token}`, origin: ORIGIN, "x-csrf-token": csrfTokenFor(sess), "content-type": "application/json" };
}

export async function stationHeaders(db: DB, eventId: string, checkpointId: string) {
  const { token } = await createSession(db, { kind: "station", eventId, checkpointId });
  const sess = (await resolveStaffSession(db, token))!;
  return { cookie: `${cookieName("staff")}=${token}`, origin: ORIGIN, "x-csrf-token": csrfTokenFor(sess), "content-type": "application/json" };
}

type Handler = (req: Request, ctx?: { params?: Promise<Record<string, unknown>> }) => Promise<Response>;

/** Invokes a Next route handler directly with a synthetic request. */
export async function call(
  handler: Handler,
  opts: { method?: string; url?: string; headers?: Record<string, string>; body?: unknown; params?: Record<string, unknown> } = {},
) {
  const req = new Request(`${ORIGIN}${opts.url ?? "/api/x"}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { host: "localhost:3000", ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json: json as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
}

export async function getTeam(db: DB, id: string) {
  return (await db.select().from(teams).where(eq(teams.id, id)))[0]!;
}
