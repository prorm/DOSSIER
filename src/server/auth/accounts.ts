import { and, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Executor } from "../db/client";
import { participants, staffUsers, teams, type StaffRole } from "../db/schema";
import { audit, type Actor } from "../audit";
import { GameError } from "../engine/errors";
import type { EventRow } from "../engine/types";
import { getCheckpoint } from "../engine/live";
import { dummyPasswordHash, hashPassword, safeEqual, sha256, verifyPassword } from "../security/crypto";
import { AUTH_BACKOFF, checkBlocked, clearKey, hitWindow, recordFailure } from "../security/ratelimit";
import { createSession, destroyTeamSessions } from "./session";

export function teamNameKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

const TeamName = z
  .string()
  .transform((s) => s.normalize("NFKC").trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(3, "Team name must be at least 3 characters")
      .max(32, "Team name must be at most 32 characters")
      .regex(/^[\p{L}\p{N} ._\-'&!]+$/u, "Team name may use letters, digits, spaces and . _ - ' & !"),
  );
const Password = z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long");

export const RegisterInput = z.object({
  teamName: TeamName,
  password: Password,
  affiliation: z.string().trim().max(60).optional().default(""),
  members: z
    .array(z.object({ name: z.string().trim().min(1, "Member name required").max(60), email: z.union([z.email().max(120), z.literal("")]).optional() }))
    .min(1, "Add at least one member")
    .max(12),
  code: z.string().trim().max(64).optional().default(""),
});

export const LoginInput = z.object({ teamName: z.string().min(1).max(64), password: z.string().min(1).max(128) });

async function guardAuth(db: Executor, keys: string[]) {
  for (const k of keys) {
    const r = await checkBlocked(db, k);
    if (!r.ok) throw new GameError("rate_limited", "Too many attempts. Try again shortly.", { retryAfterMs: r.retryAfterMs });
  }
}

async function failAuth(db: Executor, keys: string[]) {
  for (const k of keys) await recordFailure(db, k, AUTH_BACKOFF);
}

export async function registerTeam(db: Executor, event: EventRow, input: z.infer<typeof RegisterInput>, ip: string) {
  const reg = (event.config as { registration?: { open?: boolean; requiresCode?: boolean; codeHash?: string | null; min_members?: number; max_members?: number } })
    .registration ?? {};
  const window = await hitWindow(db, `reg:${ip}`, 12, 60 * 60_000);
  if (!window.ok) throw new GameError("rate_limited", "Too many registrations from this network. Ask an organiser.", { retryAfterMs: window.retryAfterMs });
  if (reg.open === false) throw new GameError("forbidden", "Registration is closed.");
  if (event.status === "ended") throw new GameError("event_ended", "The event has ended.");
  if (reg.requiresCode) {
    const ok = reg.codeHash && input.code && safeEqual(sha256(`regcode:${input.code.trim()}`), reg.codeHash);
    if (!ok) throw new GameError("forbidden", "Invalid registration code.");
  }
  const min = reg.min_members ?? 1;
  const max = reg.max_members ?? 4;
  if (input.members.length < min || input.members.length > max)
    throw new GameError("invalid", min === max ? `Teams have exactly ${min} member(s).` : `Teams have ${min}–${max} members.`);

  const passwordHash = await hashPassword(input.password);
  const nameKey = teamNameKey(input.teamName);
  const team = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(teams)
      .values({ eventId: event.id, name: input.teamName, nameKey, passwordHash, affiliation: input.affiliation || null })
      .onConflictDoNothing()
      .returning();
    const t = inserted[0];
    if (!t) throw new GameError("conflict", "That team name is taken.");
    await tx.insert(participants).values(input.members.map((m) => ({ teamId: t.id, displayName: m.name, email: m.email || null })));
    return t;
  });
  return team;
}

export async function loginTeam(db: Executor, event: EventRow, input: z.infer<typeof LoginInput>, ip: string) {
  const nameKey = teamNameKey(input.teamName);
  const keys = [`auth:ip:${ip}`, `auth:team:${event.id}:${nameKey}`];
  await guardAuth(db, keys);
  const [team] = await db.select().from(teams).where(and(eq(teams.eventId, event.id), eq(teams.nameKey, nameKey))).limit(1);
  const ok = await verifyPassword(input.password, team?.passwordHash ?? (await dummyPasswordHash()));
  if (!team || !ok) {
    await failAuth(db, keys);
    throw new GameError("unauthorized", "Team name or password is incorrect.");
  }
  await clearKey(db, keys[1]!);
  return team;
}

export async function startTeamSession(db: Executor, teamId: string, ip: string, userAgent: string | null) {
  return createSession(db, { kind: "team", teamId, ip, userAgent });
}

/* ─────────────────────────── Staff & stations ─────────────────────────── */

export const StaffLoginInput = z.object({ email: z.string().trim().toLowerCase().max(120), password: z.string().min(1).max(128) });
export const StationLoginInput = z.object({ checkpointId: z.string().max(64), pin: z.string().regex(/^\d{4,8}$/, "PIN is 4–8 digits") });

export async function loginStaff(db: Executor, input: z.infer<typeof StaffLoginInput>, ip: string) {
  const keys = [`auth:ip:${ip}`, `auth:staff:${input.email}`];
  await guardAuth(db, keys);
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, input.email)).limit(1);
  const ok = await verifyPassword(input.password, staff?.passwordHash ?? (await dummyPasswordHash()));
  if (!staff || !ok || staff.disabled) {
    await failAuth(db, keys);
    throw new GameError("unauthorized", "Email or password is incorrect.");
  }
  await clearKey(db, keys[1]!);
  const s = await createSession(db, { kind: "staff", staffId: staff.id, ip });
  await audit(db, { type: "staff", id: staff.id, label: staff.email, ip }, "staff.login");
  return { staff, ...s };
}

export async function loginStation(db: Executor, event: EventRow, input: z.infer<typeof StationLoginInput>, ip: string) {
  const keys = [`auth:ip:${ip}`, `auth:station:${event.id}:${input.checkpointId}`];
  await guardAuth(db, keys);
  const cp = await getCheckpoint(db, event.id, input.checkpointId);
  const ok = await verifyPassword(input.pin, cp?.pinHash ?? (await dummyPasswordHash()));
  if (!cp || !cp.pinHash || !ok) {
    await failAuth(db, keys);
    throw new GameError("unauthorized", "Incorrect station PIN.");
  }
  await clearKey(db, keys[1]!);
  const s = await createSession(db, { kind: "station", eventId: event.id, checkpointId: cp.id, ip });
  await audit(db, { type: "station", id: cp.id, label: `station:${cp.id}`, ip }, "station.login", { eventId: event.id, target: cp.id });
  return { checkpoint: cp, ...s };
}

export async function createStaff(db: Executor, input: { email: string; name: string; role: StaffRole; password: string }, actor: Actor) {
  const email = input.email.trim().toLowerCase();
  Password.parse(input.password);
  const passwordHash = await hashPassword(input.password);
  const inserted = await db.insert(staffUsers).values({ email, name: input.name, role: input.role, passwordHash }).onConflictDoNothing().returning();
  if (!inserted[0]) throw new GameError("conflict", "A staff account with that email exists.");
  await audit(db, actor, "staff.create", { target: email, details: { role: input.role } });
  return inserted[0];
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateTempPassword(len = 12) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s.replace(/(.{4})(?=.)/g, "$1-");
}

export async function resetTeamPassword(db: Executor, event: EventRow, teamId: string, actor: Actor) {
  const temp = generateTempPassword();
  const updated = await db
    .update(teams)
    .set({ passwordHash: await hashPassword(temp) })
    .where(and(eq(teams.id, teamId), eq(teams.eventId, event.id)))
    .returning({ id: teams.id, name: teams.name });
  if (!updated[0]) throw new GameError("not_found", "Team not found.");
  await destroyTeamSessions(db, teamId);
  await audit(db, actor, "team.password_reset", { eventId: event.id, target: teamId, details: { team: updated[0].name } });
  return { tempPassword: temp, team: updated[0] };
}
