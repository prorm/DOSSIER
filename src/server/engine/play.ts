import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { eventLog, evidenceReveals, hintPurchases, submissions, teams, unlocks } from "../db/schema";
import { env } from "../env";
import { signedAssetUrl } from "../assets/sign";
import { bus, topics } from "../realtime/bus";
import { checkAnswer, submissionFingerprint } from "../security/answers";
import { checkBlocked, clearKey, hitWindow, recordFailure, SUBMISSION_BACKOFF } from "../security/ratelimit";
import { loadContext, loadProgress } from "./context";
import { assertPlayable } from "./event";
import { GameError } from "./errors";
import { getLeaderboard, recomputeLeaderboard } from "./leaderboard";
import { modeFor } from "./modes";
import { challengeConfig, type Availability, type ChallengeMode, type ChallengeRow, type EngineContext, type EventRow, type TeamProgress } from "./types";

/* ─────────────────────────── Projections ─────────────────────────── */

export interface HintView {
  index: number;
  cost: number;
  purchased: boolean;
  /** Only present once purchased. */
  text?: string;
  /** Hints are bought in order. */
  purchasable: boolean;
}

export interface OpenChallengeView {
  id: string;
  mode: ChallengeMode;
  state: "open" | "solved";
  title: string;
  category: string | null;
  bodyMd: string;
  value: number;
  solves: number;
  firstBlood: string | null;
  solvedAt: string | null;
  hints: HintView[];
  assets: { name: string; url: string }[];
  answerType: ChallengeRow["answerType"];
  difficulty: string | null;
  tags: string[];
  position: { x: number; y: number } | null;
  requires: { all: string[]; any: string[] } | null;
  firstBloodBonus: number;
  dynamic: boolean;
}

/** A locked/scheduled challenge reveals only structure — never title, body, assets or hints. */
export interface LockedChallengeView {
  id: string;
  mode: ChallengeMode;
  state: "locked" | "scheduled";
  category: string | null;
  opensAt: string | null;
  position: { x: number; y: number } | null;
  requires: { all: string[]; any: string[] } | null;
}

export type ChallengeView = OpenChallengeView | LockedChallengeView;

export interface BoardStats {
  solveCounts: Record<string, number>;
  firstBlood: Record<string, string>;
  teamNames: Map<string, string>;
}

export async function boardStats(db: Executor, event: EventRow): Promise<BoardStats> {
  const lb = await getLeaderboard(db, event.id, "public");
  return {
    solveCounts: lb.solveCounts,
    firstBlood: lb.firstBlood,
    teamNames: new Map(lb.standings.map((s) => [s.teamId, s.name])),
  };
}

export function projectChallenge(
  c: ChallengeRow,
  avail: Availability,
  progress: TeamProgress,
  stats: BoardStats,
  event: EventRow,
): ChallengeView {
  const cfg = challengeConfig(c);
  const base = { id: c.id, mode: c.mode, category: c.category, position: cfg.position ?? null, requires: cfg.requires ?? null };
  if (avail.state === "locked" || avail.state === "scheduled") {
    return { ...base, state: avail.state, opensAt: avail.opensAt ?? null };
  }
  const solves = stats.solveCounts[c.id] ?? 0;
  const fb = stats.firstBlood[c.id];
  let nextPurchasable = true;
  const hints: HintView[] = cfg.hints.map((h, index) => {
    const purchased = progress.hints.has(`${c.id}:${index}`);
    const purchasable = !purchased && nextPurchasable && avail.state === "open";
    if (!purchased) nextPurchasable = false;
    return purchased ? { index, cost: h.cost, purchased, text: h.text, purchasable: false } : { index, cost: h.cost, purchased, purchasable };
  });
  return {
    ...base,
    state: avail.state,
    title: c.title,
    bodyMd: c.bodyMd,
    value: modeFor(c).currentValue(c, solves),
    solves,
    firstBlood: fb ? (stats.teamNames.get(fb) ?? null) : null,
    solvedAt: progress.solvedAt.get(c.id)?.toISOString() ?? null,
    hints,
    assets: cfg.assets.map((a) => ({ name: a.split("/").pop() ?? a, url: signedAssetUrl(event.id, a, progress.teamId) })),
    answerType: c.answerType,
    difficulty: cfg.difficulty ?? null,
    tags: cfg.tags,
    firstBloodBonus: cfg.first_blood_bonus,
    dynamic: cfg.scoring.type === "dynamic",
  };
}

export async function teamChallenges(db: Executor, event: EventRow, teamId: string, mode?: ChallengeMode) {
  const [ctx, progress, stats] = await Promise.all([loadContext(db, event), loadProgress(db, event.id, teamId), boardStats(db, event)]);
  const views = ctx.challenges
    .filter((c) => !mode || c.mode === mode)
    .map((c) => projectChallenge(c, modeFor(c).availability(c, ctx, progress), progress, stats, event));
  return { views, progress, ctx };
}

export async function teamChallenge(db: Executor, event: EventRow, teamId: string, challengeId: string): Promise<ChallengeView | null> {
  const [ctx, progress, stats] = await Promise.all([loadContext(db, event), loadProgress(db, event.id, teamId), boardStats(db, event)]);
  const c = ctx.byId.get(challengeId);
  if (!c) return null;
  return projectChallenge(c, modeFor(c).availability(c, ctx, progress), progress, stats, event);
}

/* ─────────────────────────── Submissions ─────────────────────────── */

export type SubmitResult =
  | { status: "correct"; points: number; firstBlood: boolean; unlocked: string[]; revealed: string[] }
  | { status: "incorrect"; retryAfterMs: number; freeAttemptsLeft: number };

const PREVIEW_MAX = 120;

export async function submitAnswer(
  db: Executor,
  opts: { event: EventRow; teamId: string; challengeId: string; answer: string; ip?: string | null; now?: Date },
): Promise<SubmitResult> {
  const { event, teamId, challengeId } = opts;
  const now = opts.now ?? new Date();
  const answer = String(opts.answer ?? "").slice(0, 500);
  if (!answer.trim()) throw new GameError("invalid", "Enter an answer.");
  assertPlayable(event, now);

  const [team] = await db.select({ status: teams.status }).from(teams).where(and(eq(teams.id, teamId), eq(teams.eventId, event.id))).limit(1);
  if (!team) throw new GameError("unauthorized", "Unknown team.");
  if (team.status === "disqualified") throw new GameError("disqualified", "This team has been disqualified.");

  const ctx: EngineContext = await loadContext(db, event, now);
  const c = ctx.byId.get(challengeId);
  if (!c) throw new GameError("not_found", "Challenge not found.");
  const progress = await loadProgress(db, event.id, teamId);
  const avail = modeFor(c).availability(c, ctx, progress);
  if (avail.state === "solved") throw new GameError("already_solved", "Already solved.");
  if (avail.state === "locked") throw new GameError("locked", "This challenge is locked.");
  if (avail.state === "scheduled") throw new GameError("scheduled", "This challenge is not open yet.", { opensAt: avail.opensAt });

  // Per-team burst guard (all challenges) + per-team-per-challenge exponential backoff.
  const burst = await hitWindow(db, `subw:${teamId}`, 30, 60_000, now);
  if (!burst.ok) throw new GameError("rate_limited", "Too many submissions. Slow down.", { retryAfterMs: burst.retryAfterMs });
  const key = `sub:${teamId}:${challengeId}`;
  const blocked = await checkBlocked(db, key, now);
  if (!blocked.ok) throw new GameError("rate_limited", "Cooling down after repeated wrong answers.", { retryAfterMs: blocked.retryAfterMs });

  const secret = env().ANSWER_SECRET;
  const correct = checkAnswer(secret, answer, c.answerType, c.normalize, c.answerHashes);
  const fingerprint = submissionFingerprint(secret, c.id, answer, c.answerType, c.normalize);

  if (!correct) {
    await db.insert(submissions).values({
      eventId: event.id,
      teamId,
      challengeId,
      correct: false,
      submittedHash: fingerprint,
      preview: answer.slice(0, PREVIEW_MAX),
      ip: opts.ip ?? null,
      createdAt: now,
    });
    const r = await recordFailure(db, key, SUBMISSION_BACKOFF, now);
    await bus().publish(topics.staff(event.id), "submission", { correct: false });
    return { status: "incorrect", retryAfterMs: r.retryAfterMs, freeAttemptsLeft: Math.max(0, r.remaining) };
  }

  // Correct: record the solve and all consequences atomically.
  const result = await db.transaction(async (tx) => {
    await tx.insert(submissions).values({
      eventId: event.id,
      teamId,
      challengeId,
      correct: true,
      submittedHash: fingerprint,
      preview: null,
      ip: opts.ip ?? null,
      createdAt: now,
    });
    const inserted = await tx
      .insert(eventLog)
      .values({ eventId: event.id, teamId, type: "solve", challengeId, points: null, payload: { mode: c.mode }, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: eventLog.id });
    if (inserted.length === 0) throw new GameError("already_solved", "Already solved.");

    const after: TeamProgress = { ...progress, solvedAt: new Map(progress.solvedAt).set(challengeId, now) };
    const effects = modeFor(c).onSolved(c, ctx, after);
    if (effects.unlocked.length) {
      await tx
        .insert(unlocks)
        .values(effects.unlocked.map((id) => ({ eventId: event.id, teamId, challengeId: id, reason: `solved:${challengeId}`, unlockedAt: now })))
        .onConflictDoNothing();
    }
    if (effects.revealedEvidence.length) {
      await tx
        .insert(evidenceReveals)
        .values(effects.revealedEvidence.map((id) => ({ eventId: event.id, teamId, evidenceId: id, source: `challenge:${challengeId}`, revealedAt: now })))
        .onConflictDoNothing();
    }
    // Solve order among eligible teams (for first blood / value).
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(eventLog)
      .innerJoin(teams, eq(teams.id, eventLog.teamId))
      .where(and(eq(eventLog.eventId, event.id), eq(eventLog.challengeId, challengeId), eq(eventLog.type, "solve"), eq(teams.status, "active")));
    return { effects, solves: Number(n) };
  });

  await clearKey(db, key);
  const firstBlood = result.solves === 1;
  const points = modeFor(c).pointsForSolve(c, result.solves - 1, result.solves);
  await recomputeLeaderboard(db, event.id);
  await bus().publish(topics.team(teamId), "solve", { challengeId, unlocked: result.effects.unlocked, revealed: result.effects.revealedEvidence });
  await bus().publish(topics.staff(event.id), "submission", { correct: true });
  if (firstBlood && c.mode === "ctf") await bus().publish(topics.event(event.id), "first-blood", { challengeId, title: c.title });
  return { status: "correct", points, firstBlood, unlocked: result.effects.unlocked, revealed: result.effects.revealedEvidence };
}

/* ─────────────────────────── Hints ─────────────────────────── */

export async function purchaseHint(db: Executor, opts: { event: EventRow; teamId: string; challengeId: string; index: number; now?: Date }) {
  const { event, teamId, challengeId, index } = opts;
  const now = opts.now ?? new Date();
  assertPlayable(event, now);
  const ctx = await loadContext(db, event, now);
  const c = ctx.byId.get(challengeId);
  if (!c) throw new GameError("not_found", "Challenge not found.");
  const progress = await loadProgress(db, event.id, teamId);
  const avail = modeFor(c).availability(c, ctx, progress);
  if (avail.state !== "open") throw new GameError(avail.state === "solved" ? "already_solved" : "locked", "Hints are only available for open challenges.");
  const hints = challengeConfig(c).hints;
  const hint = hints[index];
  if (!Number.isInteger(index) || !hint) throw new GameError("not_found", "Hint not found.");
  for (let i = 0; i < index; i++) {
    if (!progress.hints.has(`${challengeId}:${i}`)) throw new GameError("conflict", "Unlock earlier hints first.");
  }
  if (progress.hints.has(`${challengeId}:${index}`)) return { text: hint.text, cost: hint.cost, alreadyOwned: true };

  await db.transaction(async (tx) => {
    const ins = await tx
      .insert(hintPurchases)
      .values({ eventId: event.id, teamId, challengeId, hintIndex: index, cost: hint.cost, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (ins.length && hint.cost > 0) {
      await tx.insert(eventLog).values({
        eventId: event.id,
        teamId,
        type: "hint",
        challengeId,
        points: -hint.cost,
        payload: { index },
        createdAt: now,
      });
    }
  });
  if (hint.cost > 0) await recomputeLeaderboard(db, event.id);
  return { text: hint.text, cost: hint.cost, alreadyOwned: false };
}
