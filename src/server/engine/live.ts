import { and, asc, desc, eq, ilike } from "drizzle-orm";
import type { Executor } from "../db/client";
import { checkpoints, checkpointScans, eventLog, teams, usedTokens } from "../db/schema";
import { env } from "../env";
import { audit, type Actor } from "../audit";
import { bus, topics } from "../realtime/bus";
import { randomToken, signToken, verifyToken } from "../security/crypto";
import { hitWindow } from "../security/ratelimit";
import { assertPlayable } from "./event";
import { GameError } from "./errors";
import { recomputeLeaderboard } from "./leaderboard";
import type { EventRow } from "./types";

export type CheckpointRow = typeof checkpoints.$inferSelect;
export type ScanRow = typeof checkpointScans.$inferSelect;

export const BADGE_TTL_S = 90;

/* ─────────────────────────── Tokens ─────────────────────────── */

interface CheckpointClaims extends Record<string, unknown> {
  e: string;
  c: string;
  k: number;
}
interface BadgeClaims extends Record<string, unknown> {
  e: string;
  t: string;
  n: string;
  exp: number;
}

/** Printed checkpoint QR payload. Rotating tokenVersion invalidates every printed code for that checkpoint. */
export function checkpointToken(cp: CheckpointRow): string {
  return signToken(env().TOKEN_SECRET, "checkpoint", { e: cp.eventId, c: cp.id, k: cp.tokenVersion } satisfies CheckpointClaims);
}

export function checkpointUrl(cp: CheckpointRow): string {
  return `${env().APP_URL.replace(/\/$/, "")}/c/${checkpointToken(cp)}`;
}

/** Short-lived, single-use team badge shown on the team's phone and scanned by a volunteer. */
export function badgeToken(eventId: string, teamId: string): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + BADGE_TTL_S;
  const token = signToken(env().TOKEN_SECRET, "badge", { e: eventId, t: teamId, n: randomToken(12), exp } satisfies BadgeClaims);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/* ─────────────────────────── Queries ─────────────────────────── */

export async function listCheckpoints(db: Executor, eventId: string) {
  return db.select().from(checkpoints).where(eq(checkpoints.eventId, eventId)).orderBy(asc(checkpoints.sortOrder), asc(checkpoints.id));
}

export async function getCheckpoint(db: Executor, eventId: string, id: string) {
  const [cp] = await db.select().from(checkpoints).where(and(eq(checkpoints.eventId, eventId), eq(checkpoints.id, id))).limit(1);
  return cp ?? null;
}

export interface TeamCheckpointView {
  id: string;
  name: string;
  location: string;
  instructionsMd: string;
  points: number;
  status: "open" | "pending" | "confirmed" | "rejected";
  updatedAt: string | null;
}

export async function teamCheckpoints(db: Executor, event: EventRow, teamId: string): Promise<TeamCheckpointView[]> {
  const [cps, scans] = await Promise.all([
    listCheckpoints(db, event.id),
    db.select().from(checkpointScans).where(and(eq(checkpointScans.eventId, event.id), eq(checkpointScans.teamId, teamId))),
  ]);
  const byCp = new Map(scans.map((s) => [s.checkpointId, s]));
  return cps.map((cp) => {
    const s = byCp.get(cp.id);
    return {
      id: cp.id,
      name: cp.name,
      location: cp.location,
      instructionsMd: cp.instructionsMd,
      points: cp.points,
      status: s?.status ?? "open",
      updatedAt: (s?.decidedAt ?? s?.createdAt)?.toISOString() ?? null,
    };
  });
}

/* ─────────────────────────── Mutations ─────────────────────────── */

async function confirmScan(db: Executor, scan: ScanRow, cp: CheckpointRow, decidedBy: string, now: Date): Promise<boolean> {
  const updated = await db
    .update(checkpointScans)
    .set({ status: "confirmed", decidedAt: now, decidedBy, points: cp.points })
    .where(and(eq(checkpointScans.id, scan.id), eq(checkpointScans.status, "pending")))
    .returning({ id: checkpointScans.id });
  if (!updated.length) return false;
  await db.insert(eventLog).values({
    eventId: scan.eventId,
    teamId: scan.teamId,
    type: "checkpoint",
    points: cp.points,
    payload: { checkpointId: cp.id, scanId: scan.id },
    createdAt: now,
  });
  return true;
}

async function afterDecision(db: Executor, eventId: string, teamId: string, checkpointId: string, status: string) {
  if (status === "confirmed") await recomputeLeaderboard(db, eventId);
  await bus().publish(topics.team(teamId), "checkpoint", { checkpointId, status });
  await bus().publish(topics.staff(eventId), "checkpoint", { checkpointId });
}

/**
 * A team scanned a printed checkpoint QR. Idempotent: re-scans (e.g. a retry
 * from a flaky network) return the existing claim. One claim per team per
 * checkpoint, ever.
 */
export async function claimCheckpoint(db: Executor, opts: { event: EventRow; teamId: string; token: string; clientRef?: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const claims = verifyToken<CheckpointClaims>(env().TOKEN_SECRET, "checkpoint", opts.token);
  if (!claims || claims.e !== opts.event.id) throw new GameError("invalid", "This QR code is not valid for this event.");
  const limit = await hitWindow(db, `claim:${opts.teamId}`, 20, 60_000, now);
  if (!limit.ok) throw new GameError("rate_limited", "Too many scans. Wait a moment.", { retryAfterMs: limit.retryAfterMs });
  const cp = await getCheckpoint(db, opts.event.id, claims.c);
  if (!cp || cp.tokenVersion !== claims.k) throw new GameError("invalid", "This QR code has been retired. Ask a volunteer.");
  assertPlayable(opts.event, now);

  const [team] = await db.select({ status: teams.status }).from(teams).where(eq(teams.id, opts.teamId)).limit(1);
  if (team?.status === "disqualified") throw new GameError("disqualified", "This team has been disqualified.");

  const inserted = await db
    .insert(checkpointScans)
    .values({
      eventId: opts.event.id,
      checkpointId: cp.id,
      teamId: opts.teamId,
      status: "pending",
      method: "team-scan",
      clientRef: opts.clientRef?.slice(0, 64) ?? null,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  const [scan] = inserted.length
    ? inserted
    : await db
        .select()
        .from(checkpointScans)
        .where(and(eq(checkpointScans.eventId, opts.event.id), eq(checkpointScans.checkpointId, cp.id), eq(checkpointScans.teamId, opts.teamId)))
        .limit(1);
  if (!scan) throw new GameError("conflict", "Could not record the scan.");
  let status = scan.status;
  if (inserted.length && !cp.requiresApproval) {
    if (await confirmScan(db, scan, cp, "auto", now)) status = "confirmed";
  }
  if (inserted.length) await afterDecision(db, opts.event.id, opts.teamId, cp.id, status);
  return { checkpoint: { id: cp.id, name: cp.name, points: cp.points }, status, duplicate: inserted.length === 0 };
}

export async function decideScan(db: Executor, opts: { event: EventRow; scanId: string; approve: boolean; actor: Actor; stationCheckpoint?: string; note?: string }) {
  const [scan] = await db.select().from(checkpointScans).where(and(eq(checkpointScans.id, opts.scanId), eq(checkpointScans.eventId, opts.event.id))).limit(1);
  if (!scan) throw new GameError("not_found", "Scan not found.");
  if (opts.stationCheckpoint && scan.checkpointId !== opts.stationCheckpoint) throw new GameError("forbidden", "This station cannot decide scans for another checkpoint.");
  if (scan.status !== "pending") return { status: scan.status, changed: false };
  const cp = await getCheckpoint(db, opts.event.id, scan.checkpointId);
  if (!cp) throw new GameError("not_found", "Checkpoint not found.");
  const now = new Date();
  let status: ScanRow["status"] = scan.status;
  if (opts.approve) {
    if (await confirmScan(db, scan, cp, opts.actor.label, now)) status = "confirmed";
  } else {
    const upd = await db
      .update(checkpointScans)
      .set({ status: "rejected", decidedAt: now, decidedBy: opts.actor.label, note: opts.note?.slice(0, 200) ?? null })
      .where(and(eq(checkpointScans.id, scan.id), eq(checkpointScans.status, "pending")))
      .returning({ id: checkpointScans.id });
    if (upd.length) status = "rejected";
  }
  const changed = status !== scan.status;
  if (changed) {
    await audit(db, opts.actor, opts.approve ? "checkpoint.approve" : "checkpoint.reject", {
      eventId: opts.event.id,
      target: `${cp.id}/${scan.teamId}`,
      details: { scanId: scan.id, points: opts.approve ? cp.points : 0, note: opts.note ?? null },
    });
    await afterDecision(db, opts.event.id, scan.teamId, cp.id, status);
  }
  return { status, changed };
}

/** Volunteer scanned a team badge (or confirmed a team manually) at a station. */
export async function awardCheckpoint(
  db: Executor,
  opts: { event: EventRow; checkpointId: string; actor: Actor; badge?: string; teamId?: string; note?: string },
) {
  const now = new Date();
  assertPlayable(opts.event, now);
  const cp = await getCheckpoint(db, opts.event.id, opts.checkpointId);
  if (!cp) throw new GameError("not_found", "Checkpoint not found.");
  let teamId = opts.teamId;
  let method: ScanRow["method"] = "manual";
  if (opts.badge) {
    const claims = verifyToken<BadgeClaims>(env().TOKEN_SECRET, "badge", opts.badge);
    if (!claims || claims.e !== opts.event.id) throw new GameError("invalid", "Badge code is invalid or expired. Ask the team to refresh it.");
    // Single use: the nonce is burned on first redemption; a replayed screenshot fails here.
    const burned = await db
      .insert(usedTokens)
      .values({ nonce: `badge:${claims.n}`, kind: "badge", expiresAt: new Date(claims.exp * 1000) })
      .onConflictDoNothing()
      .returning();
    if (!burned.length) throw new GameError("conflict", "This badge code was already used. Ask the team to refresh it.");
    teamId = claims.t;
    method = "badge-scan";
  } else if (!opts.note?.trim()) {
    throw new GameError("invalid", "Manual awards need a note (e.g. how the team was verified).");
  }
  if (!teamId) throw new GameError("invalid", "No team selected.");
  const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.eventId, opts.event.id))).limit(1);
  if (!team) throw new GameError("not_found", "Team not found.");
  if (team.status === "disqualified") throw new GameError("disqualified", "This team is disqualified.");

  await db
    .insert(checkpointScans)
    .values({ eventId: opts.event.id, checkpointId: cp.id, teamId, status: "pending", method, createdAt: now, note: opts.note?.slice(0, 200) ?? null })
    .onConflictDoNothing();
  const [scan] = await db
    .select()
    .from(checkpointScans)
    .where(and(eq(checkpointScans.eventId, opts.event.id), eq(checkpointScans.checkpointId, cp.id), eq(checkpointScans.teamId, teamId)))
    .limit(1);
  if (!scan) throw new GameError("conflict", "Could not record the scan.");
  if (scan.status === "confirmed") return { status: "confirmed" as const, team: { id: team.id, name: team.name }, duplicate: true };
  if (scan.status === "rejected") throw new GameError("conflict", "This team's claim here was rejected. An admin can review it.");
  await confirmScan(db, scan, cp, opts.actor.label, now);
  await audit(db, opts.actor, "checkpoint.award", {
    eventId: opts.event.id,
    target: `${cp.id}/${team.id}`,
    details: { method, points: cp.points, note: opts.note ?? null },
  });
  await afterDecision(db, opts.event.id, team.id, cp.id, "confirmed");
  return { status: "confirmed" as const, team: { id: team.id, name: team.name }, duplicate: false };
}

export async function stationQueue(db: Executor, eventId: string, checkpointId: string) {
  return db
    .select({
      id: checkpointScans.id,
      teamId: checkpointScans.teamId,
      teamName: teams.name,
      status: checkpointScans.status,
      method: checkpointScans.method,
      createdAt: checkpointScans.createdAt,
      decidedAt: checkpointScans.decidedAt,
      decidedBy: checkpointScans.decidedBy,
    })
    .from(checkpointScans)
    .innerJoin(teams, eq(teams.id, checkpointScans.teamId))
    .where(and(eq(checkpointScans.eventId, eventId), eq(checkpointScans.checkpointId, checkpointId)))
    .orderBy(desc(checkpointScans.createdAt))
    .limit(100);
}

export async function findTeams(db: Executor, eventId: string, q: string) {
  const term = q.trim().slice(0, 40).replace(/[%_\\]/g, (m) => `\\${m}`);
  if (term.length < 2) return [];
  return db
    .select({ id: teams.id, name: teams.name, status: teams.status })
    .from(teams)
    .where(and(eq(teams.eventId, eventId), ilike(teams.name, `%${term}%`)))
    .orderBy(asc(teams.name))
    .limit(10);
}
