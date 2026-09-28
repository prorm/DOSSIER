import { and, eq, gt, lt } from "drizzle-orm";
import type { Executor } from "../db/client";
import { sessions, staffUsers, teams, type StaffRole } from "../db/schema";
import { env } from "../env";
import { hmacSha256, randomToken, safeEqual, sha256 } from "../security/crypto";

export const TEAM_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days — covers a multi-day fest
export const STAFF_TTL_MS = 1000 * 60 * 60 * 12;
export const STATION_TTL_MS = 1000 * 60 * 60 * 14;

export type SessionKind = "team" | "staff" | "station";

export function cookieName(kind: "team" | "staff"): string {
  const prod = env().NODE_ENV === "production" && env().APP_URL.startsWith("https://");
  // __Host- cookies must be Secure, Path=/ and host-only: they cannot be set by a sibling subdomain.
  return `${prod ? "__Host-" : ""}dossier_${kind}`;
}

export function cookieOptions(maxAgeMs: number) {
  const secure = env().APP_URL.startsWith("https://");
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: Math.floor(maxAgeMs / 1000) };
}

export interface TeamSession {
  kind: "team";
  sessionId: string;
  csrfSecret: string;
  team: typeof teams.$inferSelect;
}

export interface StaffSession {
  kind: "staff";
  sessionId: string;
  csrfSecret: string;
  staff: typeof staffUsers.$inferSelect;
}

export interface StationSession {
  kind: "station";
  sessionId: string;
  csrfSecret: string;
  eventId: string;
  checkpointId: string;
}

export type AnySession = TeamSession | StaffSession | StationSession;

export async function createSession(
  db: Executor,
  opts: { kind: SessionKind; teamId?: string; staffId?: string; eventId?: string; checkpointId?: string; ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; ttlMs: number }> {
  const token = randomToken(32);
  const ttlMs = opts.kind === "team" ? TEAM_TTL_MS : opts.kind === "staff" ? STAFF_TTL_MS : STATION_TTL_MS;
  await db.insert(sessions).values({
    id: sha256(token),
    kind: opts.kind,
    teamId: opts.teamId ?? null,
    staffId: opts.staffId ?? null,
    eventId: opts.eventId ?? null,
    checkpointId: opts.checkpointId ?? null,
    csrfSecret: randomToken(24),
    ip: opts.ip ?? null,
    userAgent: opts.userAgent?.slice(0, 200) ?? null,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return { token, ttlMs };
}

export async function destroySession(db: Executor, token: string | undefined) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function destroyTeamSessions(db: Executor, teamId: string) {
  await db.delete(sessions).where(eq(sessions.teamId, teamId));
}

const TOUCH_INTERVAL_MS = 60_000;

async function loadRow(db: Executor, token: string | undefined) {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (row && Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
    if (row.teamId) await db.update(teams).set({ lastSeenAt: new Date() }).where(eq(teams.id, row.teamId));
  }
  return row ?? null;
}

export async function resolveTeamSession(db: Executor, token: string | undefined): Promise<TeamSession | null> {
  const row = await loadRow(db, token);
  if (!row || row.kind !== "team" || !row.teamId) return null;
  const [team] = await db.select().from(teams).where(eq(teams.id, row.teamId)).limit(1);
  if (!team) return null;
  return { kind: "team", sessionId: row.id, csrfSecret: row.csrfSecret, team };
}

export async function resolveStaffSession(db: Executor, token: string | undefined): Promise<StaffSession | StationSession | null> {
  const row = await loadRow(db, token);
  if (!row) return null;
  if (row.kind === "station" && row.eventId && row.checkpointId) {
    return { kind: "station", sessionId: row.id, csrfSecret: row.csrfSecret, eventId: row.eventId, checkpointId: row.checkpointId };
  }
  if (row.kind !== "staff" || !row.staffId) return null;
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, row.staffId)).limit(1);
  if (!staff || staff.disabled) return null;
  return { kind: "staff", sessionId: row.id, csrfSecret: row.csrfSecret, staff };
}

/** CSRF token bound to the session: HMAC(SESSION_SECRET, csrfSecret). Rendered into pages, echoed in a header. */
export function csrfTokenFor(session: { csrfSecret: string }): string {
  return hmacSha256(env().SESSION_SECRET, `csrf:${session.csrfSecret}`);
}

export function verifyCsrf(session: { csrfSecret: string }, provided: string | null): boolean {
  if (!provided) return false;
  return safeEqual(provided, csrfTokenFor(session));
}

const ROLE_RANK: Record<StaffRole, number> = { volunteer: 1, admin: 2, owner: 3 };
export function hasRole(role: StaffRole, required: StaffRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function purgeExpiredSessions(db: Executor) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
