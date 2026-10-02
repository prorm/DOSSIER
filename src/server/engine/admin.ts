import { and, count, desc, eq, gt, gte, ilike, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../db/client";
import {
  announcements,
  auditLog,
  challenges,
  checkpoints,
  eventLog,
  participants,
  scoreAdjustments,
  sessions,
  staffUsers,
  submissions,
  teams,
} from "../db/schema";
import { audit, type Actor } from "../audit";
import { bus, topics } from "../realtime/bus";
import { hashPassword } from "../security/crypto";
import { GameError } from "./errors";
import { getLeaderboard, recomputeLeaderboard } from "./leaderboard";
import type { EventRow } from "./types";

/* ─────────────────────────── Teams ─────────────────────────── */

export async function setTeamStatus(db: Executor, event: EventRow, teamId: string, disqualify: boolean, reason: string, actor: Actor) {
  if (disqualify && reason.trim().length < 3) throw new GameError("invalid", "A reason is required to disqualify a team.");
  const [t] = await db
    .update(teams)
    .set({ status: disqualify ? "disqualified" : "active", statusReason: disqualify ? reason.trim() : null })
    .where(and(eq(teams.id, teamId), eq(teams.eventId, event.id)))
    .returning();
  if (!t) throw new GameError("not_found", "Team not found.");
  await audit(db, actor, disqualify ? "team.disqualify" : "team.reinstate", { eventId: event.id, target: teamId, details: { team: t.name, reason } });
  await recomputeLeaderboard(db, event.id);
  await bus().publish(topics.team(teamId), "status", { status: t.status });
  return t;
}

export const AdjustInput = z.object({
  teamId: z.uuid(),
  delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "Delta cannot be zero"),
  reason: z.string().trim().min(5, "A reason (≥5 characters) is mandatory").max(300),
});

export async function adjustScore(db: Executor, event: EventRow, input: z.infer<typeof AdjustInput>, actor: Actor) {
  const parsed = AdjustInput.parse(input);
  const [t] = await db.select().from(teams).where(and(eq(teams.id, parsed.teamId), eq(teams.eventId, event.id))).limit(1);
  if (!t) throw new GameError("not_found", "Team not found.");
  await db.transaction(async (tx) => {
    const [adj] = await tx
      .insert(scoreAdjustments)
      .values({ eventId: event.id, teamId: t.id, delta: parsed.delta, reason: parsed.reason, createdBy: actor.type === "staff" ? actor.id : null })
      .returning();
    await tx.insert(eventLog).values({ eventId: event.id, teamId: t.id, type: "adjustment", points: parsed.delta, payload: { adjustmentId: adj!.id, reason: parsed.reason } });
    await audit(tx, actor, "score.adjust", { eventId: event.id, target: t.id, details: { team: t.name, delta: parsed.delta, reason: parsed.reason } });
  });
  await recomputeLeaderboard(db, event.id);
}

export async function teamDetail(db: Executor, event: EventRow, teamId: string) {
  const [t] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.eventId, event.id))).limit(1);
  if (!t) return null;
  const [members, log, subs, adjustments] = await Promise.all([
    db.select().from(participants).where(eq(participants.teamId, teamId)),
    db.select().from(eventLog).where(and(eq(eventLog.eventId, event.id), eq(eventLog.teamId, teamId))).orderBy(desc(eventLog.id)).limit(200),
    db.select().from(submissions).where(and(eq(submissions.eventId, event.id), eq(submissions.teamId, teamId))).orderBy(desc(submissions.id)).limit(100),
    db.select().from(scoreAdjustments).where(and(eq(scoreAdjustments.eventId, event.id), eq(scoreAdjustments.teamId, teamId))).orderBy(desc(scoreAdjustments.createdAt)),
  ]);
  const { passwordHash: _omit, ...team } = t;
  void _omit;
  return { team, members, log, submissions: subs, adjustments };
}

/* ─────────────────────────── Announcements ─────────────────────────── */

export const AnnouncementInput = z.object({
  title: z.string().trim().min(2).max(100),
  body: z.string().trim().max(1000).default(""),
  level: z.enum(["info", "warning", "critical"]).default("info"),
});

export async function announce(db: Executor, event: EventRow, input: z.infer<typeof AnnouncementInput>, actor: Actor) {
  const [a] = await db
    .insert(announcements)
    .values({ eventId: event.id, ...input, createdBy: actor.type === "staff" ? actor.id : null })
    .returning();
  await audit(db, actor, "announcement.create", { eventId: event.id, target: a!.id, details: { title: input.title, level: input.level } });
  await bus().publish(topics.event(event.id), "announcement", { id: a!.id, title: a!.title, body: a!.body, level: a!.level, at: a!.createdAt.toISOString() });
  return a!;
}

export async function listAnnouncements(db: Executor, eventId: string, limit = 20) {
  return db.select().from(announcements).where(eq(announcements.eventId, eventId)).orderBy(desc(announcements.createdAt)).limit(limit);
}

/* ─────────────────────────── Operations dashboard ─────────────────────────── */

export async function dashboardStats(db: Executor, event: EventRow) {
  const now = Date.now();
  const since5 = new Date(now - 5 * 60_000);
  const online = new Date(now - 3 * 60_000);
  const stuckMinutes = ((event.config as { scoring?: { stuck_after_minutes?: number } }).scoring?.stuck_after_minutes ?? 30);
  const [teamCount, onlineRows, subs5, correct5, lb, chs, perChallenge, lastSolve] = await Promise.all([
    db.select({ n: count() }).from(teams).where(eq(teams.eventId, event.id)),
    db
      .selectDistinct({ teamId: sessions.teamId })
      .from(sessions)
      .innerJoin(teams, eq(teams.id, sessions.teamId))
      .where(and(eq(teams.eventId, event.id), gt(sessions.lastSeenAt, online))),
    db.select({ n: count() }).from(submissions).where(and(eq(submissions.eventId, event.id), gte(submissions.createdAt, since5))),
    db.select({ n: count() }).from(submissions).where(and(eq(submissions.eventId, event.id), gte(submissions.createdAt, since5), eq(submissions.correct, true))),
    getLeaderboard(db, event.id, "live"),
    db.select().from(challenges).where(eq(challenges.eventId, event.id)).orderBy(challenges.sortOrder),
    db
      .select({
        challengeId: submissions.challengeId,
        attempts: count(),
        wrong: sql<number>`count(*) filter (where not ${submissions.correct})::int`,
        teams: sql<number>`count(distinct ${submissions.teamId})::int`,
      })
      .from(submissions)
      .where(eq(submissions.eventId, event.id))
      .groupBy(submissions.challengeId),
    db
      .select({ teamId: eventLog.teamId, last: sql<Date>`max(${eventLog.createdAt})` })
      .from(eventLog)
      .where(and(eq(eventLog.eventId, event.id), eq(eventLog.type, "solve")))
      .groupBy(eventLog.teamId),
  ]);
  const attempts = new Map(perChallenge.map((p) => [p.challengeId, p]));
  const lastSolveBy = new Map(lastSolve.map((r) => [r.teamId, new Date(r.last)]));
  const stuckCutoff = now - stuckMinutes * 60_000;
  const reference = event.startedAt?.getTime() ?? now;
  const stuck =
    event.status === "live"
      ? lb.standings
          .filter((s) => !s.disqualified)
          .map((s) => ({ ...s, lastSolveAt: lastSolveBy.get(s.teamId) ?? null }))
          .filter((s) => (s.lastSolveAt?.getTime() ?? reference) < stuckCutoff)
          .map((s) => ({ teamId: s.teamId, name: s.name, score: s.score, lastSolveAt: s.lastSolveAt?.toISOString() ?? null }))
          .slice(0, 25)
      : [];
  return {
    teams: teamCount[0]?.n ?? 0,
    online: onlineRows.length,
    submissionsPerMin: Math.round(((subs5[0]?.n ?? 0) / 5) * 10) / 10,
    correctPerMin: Math.round(((correct5[0]?.n ?? 0) / 5) * 10) / 10,
    challenges: chs.map((c) => ({
      id: c.id,
      title: c.title,
      mode: c.mode,
      hidden: c.hidden,
      solves: lb.solveCounts[c.id] ?? 0,
      attempts: attempts.get(c.id)?.attempts ?? 0,
      wrong: attempts.get(c.id)?.wrong ?? 0,
      teamsTried: attempts.get(c.id)?.teams ?? 0,
    })),
    stuck,
    stuckMinutes,
    leaderboard: lb.standings.slice(0, 10),
  };
}

/* ─────────────────────────── Submission log ─────────────────────────── */

export const SubmissionQuery = z.object({
  q: z.string().max(60).optional(),
  challengeId: z.string().max(64).optional(),
  result: z.enum(["all", "correct", "wrong"]).default("all"),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function searchSubmissions(db: Executor, event: EventRow, q: z.infer<typeof SubmissionQuery>) {
  const conds: SQL[] = [eq(submissions.eventId, event.id)];
  if (q.challengeId) conds.push(eq(submissions.challengeId, q.challengeId));
  if (q.result === "correct") conds.push(eq(submissions.correct, true));
  if (q.result === "wrong") conds.push(eq(submissions.correct, false));
  if (q.before) conds.push(lt(submissions.id, q.before));
  if (q.q?.trim()) {
    const term = `%${q.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(sql`(${ilike(teams.name, term)} OR ${ilike(submissions.preview, term)})`);
  }
  const rows = await db
    .select({
      id: submissions.id,
      teamId: submissions.teamId,
      teamName: teams.name,
      challengeId: submissions.challengeId,
      correct: submissions.correct,
      // Correct answers are never stored in clear; wrong ones show a truncated preview.
      preview: submissions.preview,
      fingerprint: sql<string>`left(${submissions.submittedHash}, 10)`,
      ip: submissions.ip,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .where(and(...conds))
    .orderBy(desc(submissions.id))
    .limit(q.limit);
  return rows;
}

/* ─────────────────────────── Suspicious activity ─────────────────────────── */

export interface Signal {
  kind: "shared-wrong-answer" | "shared-ip" | "fast-solve" | "submission-burst";
  severity: "low" | "medium" | "high";
  summary: string;
  teams: { id: string; name: string }[];
  details: Record<string, unknown>;
}

/**
 * Surfaces *signals* for a human to review. Nothing here bans or penalises
 * automatically — collisions happen honestly (shared campus Wi-Fi, common typos).
 */
export async function suspiciousSignals(db: Executor, event: EventRow): Promise<Signal[]> {
  const signals: Signal[] = [];
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.eventId, event.id));
  const name = new Map(teamRows.map((t) => [t.id, t.name]));
  const T = (ids: string[]) => ids.map((id) => ({ id, name: name.get(id) ?? id }));

  // 1. Identical *wrong* answers from several teams on the same challenge (answer sharing).
  const shared = await db
    .select({
      challengeId: submissions.challengeId,
      fp: submissions.submittedHash,
      preview: sql<string>`min(${submissions.preview})`,
      teamIds: sql<string[]>`array_agg(distinct ${submissions.teamId}::text)`,
      n: sql<number>`count(distinct ${submissions.teamId})::int`,
    })
    .from(submissions)
    .where(and(eq(submissions.eventId, event.id), eq(submissions.correct, false)))
    .groupBy(submissions.challengeId, submissions.submittedHash)
    .having(sql`count(distinct ${submissions.teamId}) >= 3`)
    .limit(50);
  for (const s of shared) {
    const preview = s.preview ?? "";
    if (preview.trim().length < 4) continue; // "a", "yes", "123": too common to mean anything
    signals.push({
      kind: "shared-wrong-answer",
      severity: s.n >= 5 ? "high" : "medium",
      summary: `${s.n} teams submitted the same wrong answer to ${s.challengeId}`,
      teams: T(s.teamIds),
      details: { challengeId: s.challengeId, preview: preview.slice(0, 40) },
    });
  }

  // 2. Several teams submitting from one IP (could be a shared NAT — low severity by default).
  const ips = await db
    .select({
      ip: submissions.ip,
      teamIds: sql<string[]>`array_agg(distinct ${submissions.teamId}::text)`,
      n: sql<number>`count(distinct ${submissions.teamId})::int`,
    })
    .from(submissions)
    .where(and(eq(submissions.eventId, event.id), sql`${submissions.ip} is not null`))
    .groupBy(submissions.ip)
    .having(sql`count(distinct ${submissions.teamId}) >= 2`)
    .limit(50);
  for (const r of ips) {
    signals.push({
      kind: "shared-ip",
      severity: r.n >= 4 ? "medium" : "low",
      summary: `${r.n} teams submitted from ${r.ip}`,
      teams: T(r.teamIds),
      details: { ip: r.ip, note: "Common on campus Wi-Fi / NAT; corroborate before acting." },
    });
  }

  // 3. Correct answer with no prior wrong attempts within seconds of another team's solve of the same challenge.
  const solves = await db
    .select({ teamId: eventLog.teamId, challengeId: eventLog.challengeId, at: eventLog.createdAt })
    .from(eventLog)
    .where(and(eq(eventLog.eventId, event.id), eq(eventLog.type, "solve")))
    .orderBy(eventLog.challengeId, eventLog.createdAt);
  const byChallenge = new Map<string, { teamId: string; at: Date }[]>();
  for (const s of solves) if (s.challengeId) (byChallenge.get(s.challengeId) ?? byChallenge.set(s.challengeId, []).get(s.challengeId)!).push(s);
  for (const [cid, list] of byChallenge) {
    for (let i = 1; i < list.length; i++) {
      const gap = list[i]!.at.getTime() - list[i - 1]!.at.getTime();
      if (gap >= 0 && gap < 20_000) {
        signals.push({
          kind: "fast-solve",
          severity: "low",
          summary: `${name.get(list[i]!.teamId)} solved ${cid} ${Math.round(gap / 1000)}s after ${name.get(list[i - 1]!.teamId)}`,
          teams: T([list[i - 1]!.teamId, list[i]!.teamId]),
          details: { challengeId: cid, gapMs: gap },
        });
      }
    }
  }

  // 4. Submission bursts (≥ 25 submissions in any one minute by one team).
  const bursts = await db
    .select({
      teamId: submissions.teamId,
      minute: sql<string>`date_trunc('minute', ${submissions.createdAt})::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .where(eq(submissions.eventId, event.id))
    .groupBy(submissions.teamId, sql`date_trunc('minute', ${submissions.createdAt})`)
    .having(sql`count(*) >= 25`)
    .limit(50);
  for (const b of bursts) {
    signals.push({
      kind: "submission-burst",
      severity: "medium",
      summary: `${name.get(b.teamId)} made ${b.n} submissions in one minute (possible scripted guessing)`,
      teams: T([b.teamId]),
      details: { minute: b.minute },
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ─────────────────────────── Checkpoints & staff ─────────────────────────── */

export async function setCheckpointPin(db: Executor, event: EventRow, checkpointId: string, pin: string, actor: Actor) {
  if (!/^\d{4,8}$/.test(pin)) throw new GameError("invalid", "PIN must be 4–8 digits.");
  const upd = await db
    .update(checkpoints)
    .set({ pinHash: await hashPassword(pin) })
    .where(and(eq(checkpoints.eventId, event.id), eq(checkpoints.id, checkpointId)))
    .returning({ id: checkpoints.id });
  if (!upd.length) throw new GameError("not_found", "Checkpoint not found.");
  // Changing the PIN signs out every station session for that checkpoint.
  await db.delete(sessions).where(and(eq(sessions.kind, "station"), eq(sessions.eventId, event.id), eq(sessions.checkpointId, checkpointId)));
  await audit(db, actor, "checkpoint.set_pin", { eventId: event.id, target: checkpointId });
}

export async function rotateCheckpointToken(db: Executor, event: EventRow, checkpointId: string, actor: Actor) {
  const upd = await db
    .update(checkpoints)
    .set({ tokenVersion: sql`${checkpoints.tokenVersion} + 1` })
    .where(and(eq(checkpoints.eventId, event.id), eq(checkpoints.id, checkpointId)))
    .returning({ id: checkpoints.id, tokenVersion: checkpoints.tokenVersion });
  if (!upd.length) throw new GameError("not_found", "Checkpoint not found.");
  await audit(db, actor, "checkpoint.rotate_qr", { eventId: event.id, target: checkpointId, details: { tokenVersion: upd[0]!.tokenVersion } });
}

export async function listStaff(db: Executor) {
  return db
    .select({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, role: staffUsers.role, disabled: staffUsers.disabled, createdAt: staffUsers.createdAt })
    .from(staffUsers)
    .orderBy(staffUsers.email);
}

export async function setStaffDisabled(db: Executor, staffId: string, disabled: boolean, actor: Actor) {
  if (actor.id === staffId) throw new GameError("invalid", "You cannot disable your own account.");
  const [s] = await db.update(staffUsers).set({ disabled }).where(eq(staffUsers.id, staffId)).returning();
  if (!s) throw new GameError("not_found", "Staff account not found.");
  if (disabled) await db.delete(sessions).where(eq(sessions.staffId, staffId));
  await audit(db, actor, disabled ? "staff.disable" : "staff.enable", { target: s.email });
}

export async function listAudit(db: Executor, eventId: string | null, before?: number, limit = 100) {
  const conds: SQL[] = [];
  if (eventId) conds.push(sql`(${auditLog.eventId} = ${eventId} OR ${auditLog.eventId} IS NULL)`);
  if (before) conds.push(lt(auditLog.id, before));
  return db
    .select()
    .from(auditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit);
}

export async function teamsWithScores(db: Executor, event: EventRow, q?: string) {
  const lb = await getLeaderboard(db, event.id, "live");
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      status: teams.status,
      statusReason: teams.statusReason,
      affiliation: teams.affiliation,
      lastSeenAt: teams.lastSeenAt,
      createdAt: teams.createdAt,
      members: sql<number>`(select count(*)::int from ${participants} where ${participants.teamId} = ${teams.id})`,
    })
    .from(teams)
    .where(and(eq(teams.eventId, event.id), q?.trim() ? ilike(teams.name, `%${q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`) : undefined))
    .orderBy(teams.name)
    .limit(500);
  const byId = new Map(lb.standings.map((s) => [s.teamId, s]));
  return rows.map((r) => ({ ...r, score: byId.get(r.id)?.score ?? 0, rank: byId.get(r.id)?.rank ?? null }));
}

