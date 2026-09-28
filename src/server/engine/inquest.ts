import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../db/client";
import { accusations, boardStates, eventLog, evidenceReveals } from "../db/schema";
import { signedAssetUrl } from "../assets/sign";
import { bus, topics } from "../realtime/bus";
import type { StoryDef } from "../packs/schema";
import { loadProgress } from "./context";
import { assertPlayable, eventPhase } from "./event";
import { GameError } from "./errors";
import { recomputeLeaderboard } from "./leaderboard";
import type { EventRow } from "./types";
import { applyBoardOps, EMPTY_BOARD, type BoardLayout, type BoardOp } from "../../lib/board";

export { applyBoardOps, BoardOp, EMPTY_BOARD, type BoardLayout } from "../../lib/board";

export type Story = StoryDef;

export function storyOf(event: EventRow): Story | null {
  return (event.story as Story | null) ?? null;
}

/* ─────────────────────────── Evidence pipeline ─────────────────────────── */

type RevealRule = Story["evidence"][number]["reveal"];

function ruleSatisfied(rule: RevealRule, event: EventRow, now: Date, solved: Map<string, Date>): { ok: boolean; at?: Date } {
  const started = eventPhase(event, now) !== "standby";
  if (!started) return { ok: false };
  if ("at_start" in rule) return { ok: true, at: event.startedAt ?? now };
  if ("visible_from" in rule) {
    const t = new Date(rule.visible_from);
    return t <= now ? { ok: true, at: t } : { ok: false };
  }
  const at = solved.get(rule.after_challenge);
  return at ? { ok: true, at } : { ok: false };
}

export interface EvidenceStatus {
  revealed: Map<string, { at: Date; seen: boolean; source: string }>;
  sealedCount: number;
  nextReleaseAt: string | null;
}

/**
 * Evaluates every reveal rule for a team and materialises newly satisfied
 * reveals into evidence_reveals (so "new" badges and reveal times are stable).
 */
export async function evidenceStatus(db: Executor, event: EventRow, teamId: string, now = new Date()): Promise<EvidenceStatus> {
  const story = storyOf(event);
  if (!story) return { revealed: new Map(), sealedCount: 0, nextReleaseAt: null };
  const [progress, rows] = await Promise.all([
    loadProgress(db, event.id, teamId),
    db.select().from(evidenceReveals).where(and(eq(evidenceReveals.eventId, event.id), eq(evidenceReveals.teamId, teamId))),
  ]);
  const revealed = new Map(rows.map((r) => [r.evidenceId, { at: r.revealedAt, seen: Boolean(r.seenAt), source: r.source }]));
  const toInsert: (typeof evidenceReveals.$inferInsert)[] = [];
  let nextReleaseAt: Date | null = null;
  for (const ev of story.evidence) {
    if (revealed.has(ev.id)) continue;
    const r = ruleSatisfied(ev.reveal, event, now, progress.solvedAt);
    if (r.ok) {
      const source = "at_start" in ev.reveal ? "start" : "visible_from" in ev.reveal ? "time" : `challenge:${ev.reveal.after_challenge}`;
      toInsert.push({ eventId: event.id, teamId, evidenceId: ev.id, source, revealedAt: r.at ?? now });
      revealed.set(ev.id, { at: r.at ?? now, seen: false, source });
    } else if ("visible_from" in ev.reveal) {
      const t = new Date(ev.reveal.visible_from);
      if (t > now && (!nextReleaseAt || t < nextReleaseAt)) nextReleaseAt = t;
    }
  }
  if (toInsert.length) await db.insert(evidenceReveals).values(toInsert).onConflictDoNothing();
  return {
    revealed,
    sealedCount: story.evidence.length - revealed.size,
    nextReleaseAt: eventPhase(event, now) === "standby" ? null : (nextReleaseAt?.toISOString() ?? null),
  };
}

export async function markEvidenceSeen(db: Executor, eventId: string, teamId: string, evidenceId: string) {
  await db
    .update(evidenceReveals)
    .set({ seenAt: new Date() })
    .where(and(eq(evidenceReveals.eventId, eventId), eq(evidenceReveals.teamId, teamId), eq(evidenceReveals.evidenceId, evidenceId), sql`${evidenceReveals.seenAt} is null`));
}

/* ─────────────────────────── Case-file projection ─────────────────────────── */

export interface EvidenceView {
  id: string;
  title: string;
  kind: string;
  summary: string;
  bodyMd: string;
  image: string | null;
  location: { id: string; name: string } | null;
  suspects: { id: string; name: string }[];
  revealedAt: string;
  isNew: boolean;
  source: string;
}

export interface PersonView {
  id: string;
  name: string;
  role: string;
  details: { label: string; value: string }[];
  bodyMd: string;
  image: string | null;
}

export interface AccusationFieldView {
  id: string;
  label: string;
  type: string;
  points: number;
  options: { id: string; label: string }[];
}

export interface AccusationStateView {
  fields: AccusationFieldView[];
  maxAttempts: number;
  attemptsUsed: number;
  penalties: number[];
  nextPenalty: number;
  locked: boolean;
  solved: boolean;
  history: { attemptNo: number; correctCount: number; totalFields: number; credit: number; penalty: number; at: string }[];
}

export interface CaseFileView {
  case: Story["case"];
  briefingMd: string;
  victim: { name: string; details: { label: string; value: string }[]; bodyMd: string; image: string | null };
  locations: { id: string; name: string; bodyMd: string; image: string | null }[];
  suspects: PersonView[];
  evidence: EvidenceView[];
  sealedCount: number;
  nextReleaseAt: string | null;
  timeline: { at: string; title: string; body: string }[];
  hiddenTimelineCount: number;
  accusation: AccusationStateView;
  solution: { md: string; answers: { field: string; value: string }[] } | null;
}

export async function caseFile(db: Executor, event: EventRow, teamId: string, now = new Date()): Promise<CaseFileView | null> {
  const story = storyOf(event);
  if (!story) return null;
  const status = await evidenceStatus(db, event, teamId, now);
  const img = (p?: string) => (p ? signedAssetUrl(event.id, p, teamId) : null);
  const suspectName = new Map(story.suspects.map((s) => [s.id, s.name]));
  const locName = new Map(story.locations.map((l) => [l.id, l.name]));

  const evidence: EvidenceView[] = story.evidence
    .filter((e) => status.revealed.has(e.id))
    .map((e) => {
      const r = status.revealed.get(e.id)!;
      return {
        id: e.id,
        title: e.title,
        kind: e.kind,
        summary: e.summary,
        bodyMd: e.body,
        image: img(e.image),
        location: e.location ? { id: e.location, name: locName.get(e.location) ?? e.location } : null,
        suspects: e.suspects.map((s) => ({ id: s, name: suspectName.get(s) ?? s })),
        revealedAt: r.at.toISOString(),
        isNew: !r.seen,
        source: r.source,
      };
    })
    .sort((a, b) => a.revealedAt.localeCompare(b.revealedAt));

  const timeline = story.timeline.filter((t) => !t.requires_evidence || status.revealed.has(t.requires_evidence));
  const accusation = await accusationState(db, event, teamId, story, status);
  const ended = eventPhase(event, now) === "ended";
  return {
    case: story.case,
    briefingMd: story.briefing,
    victim: { name: story.victim.name, details: story.victim.details, bodyMd: story.victim.body, image: img(story.victim.image) },
    locations: story.locations.map((l) => ({ id: l.id, name: l.name, bodyMd: l.body, image: img(l.image) })),
    suspects: story.suspects.map((s) => ({ id: s.id, name: s.name, role: s.role, details: s.details, bodyMd: s.body, image: img(s.image) })),
    evidence,
    sealedCount: status.sealedCount,
    nextReleaseAt: status.nextReleaseAt,
    timeline: timeline.map((t) => ({ at: t.at, title: t.title, body: t.body })),
    hiddenTimelineCount: story.timeline.length - timeline.length,
    accusation,
    // The solution is disclosed only once the event has ended.
    solution: ended
      ? {
          md: story.accusation.solution_md,
          answers: story.accusation.fields.map((f) => ({ field: f.label, value: optionLabel(story, f, story.accusation.solution[f.id]!) })),
        }
      : null,
  };
}

function optionLabel(story: Story, field: Story["accusation"]["fields"][number], id: string): string {
  if (field.type === "suspect") return story.suspects.find((s) => s.id === id)?.name ?? id;
  if (field.type === "location") return story.locations.find((l) => l.id === id)?.name ?? id;
  if (field.type === "evidence") return story.evidence.find((e) => e.id === id)?.title ?? id;
  return field.options.find((o) => o.id === id)?.label ?? id;
}

function fieldOptions(story: Story, field: Story["accusation"]["fields"][number], revealed: Set<string>) {
  if (field.type === "suspect") return story.suspects.map((s) => ({ id: s.id, label: s.name }));
  if (field.type === "location") return story.locations.map((l) => ({ id: l.id, label: l.name }));
  // Only revealed evidence may be offered — listing sealed evidence would leak it.
  if (field.type === "evidence") return story.evidence.filter((e) => revealed.has(e.id)).map((e) => ({ id: e.id, label: e.title }));
  return field.options.map((o) => ({ id: o.id, label: o.label }));
}

/* ─────────────────────────── Accusations ─────────────────────────── */

export function penaltyFor(penalties: number[], wrongSoFar: number): number {
  return penalties[Math.min(wrongSoFar, penalties.length - 1)] ?? 0;
}

async function accusationState(db: Executor, event: EventRow, teamId: string, story: Story, status: EvidenceStatus): Promise<AccusationStateView> {
  const rows = await db
    .select()
    .from(accusations)
    .where(and(eq(accusations.eventId, event.id), eq(accusations.teamId, teamId)))
    .orderBy(asc(accusations.attemptNo));
  const acc = story.accusation;
  const solved = rows.some((r) => r.fullyCorrect);
  const wrong = rows.filter((r) => !r.fullyCorrect).length;
  const revealedSet = new Set(status.revealed.keys());
  return {
    fields: acc.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, points: f.points, options: fieldOptions(story, f, revealedSet) })),
    maxAttempts: acc.max_attempts,
    attemptsUsed: rows.length,
    penalties: acc.penalties,
    nextPenalty: penaltyFor(acc.penalties, wrong),
    locked: solved || rows.length >= acc.max_attempts,
    solved,
    history: rows.map((r) => ({
      attemptNo: r.attemptNo,
      correctCount: r.correctFields.length,
      totalFields: acc.fields.length,
      credit: r.credit,
      penalty: r.penalty,
      at: r.createdAt.toISOString(),
    })),
  };
}

export const AccusationInput = z.record(z.string().max(64), z.string().max(64));

export interface AccusationResult {
  attemptNo: number;
  correctCount: number;
  totalFields: number;
  fullyCorrect: boolean;
  credit: number;
  penalty: number;
  delta: number;
  attemptsLeft: number;
  locked: boolean;
}

/**
 * Files an accusation. Scoring: the team's inquest verdict score is its best
 * credit so far minus the sum of penalties; each attempt logs the change.
 * A fully correct accusation — or running out of attempts — locks the verdict.
 * Feedback reports only HOW MANY findings were right, never which ones.
 */
export async function fileAccusation(
  db: Executor,
  opts: { event: EventRow; teamId: string; answers: Record<string, string>; now?: Date },
): Promise<AccusationResult> {
  const { event, teamId } = opts;
  const now = opts.now ?? new Date();
  assertPlayable(event, now);
  const story = storyOf(event);
  if (!story) throw new GameError("not_found", "This event has no inquest.");
  const acc = story.accusation;
  const status = await evidenceStatus(db, event, teamId, now);
  const revealedSet = new Set(status.revealed.keys());

  for (const f of acc.fields) {
    const v = opts.answers[f.id];
    if (!v) throw new GameError("invalid", `Choose an answer for "${f.label}".`);
    if (!fieldOptions(story, f, revealedSet).some((o) => o.id === v)) throw new GameError("invalid", `Invalid choice for "${f.label}".`);
  }

  const result = await db.transaction(async (tx) => {
    const prior = await tx
      .select()
      .from(accusations)
      .where(and(eq(accusations.eventId, event.id), eq(accusations.teamId, teamId)))
      .orderBy(asc(accusations.attemptNo));
    if (prior.some((p) => p.fullyCorrect)) throw new GameError("already_solved", "Your verdict is already locked in.");
    if (prior.length >= acc.max_attempts) throw new GameError("attempts_exhausted", "No accusation attempts remain.");

    const correctFields = acc.fields.filter((f) => opts.answers[f.id] === acc.solution[f.id]).map((f) => f.id);
    const credit = acc.fields.filter((f) => correctFields.includes(f.id)).reduce((s, f) => s + f.points, 0);
    const fullyCorrect = correctFields.length === acc.fields.length;
    const wrongSoFar = prior.filter((p) => !p.fullyCorrect).length;
    const penalty = fullyCorrect ? 0 : penaltyFor(acc.penalties, wrongSoFar);
    const bestBefore = prior.reduce((m, p) => Math.max(m, p.credit), 0);
    const delta = Math.max(0, credit - bestBefore) - penalty;
    const attemptNo = prior.length + 1;

    await tx.insert(accusations).values({
      eventId: event.id,
      teamId,
      attemptNo,
      answers: Object.fromEntries(acc.fields.map((f) => [f.id, opts.answers[f.id]!])),
      credit,
      penalty,
      correctFields,
      fullyCorrect,
      createdAt: now,
    });
    await tx.insert(eventLog).values({
      eventId: event.id,
      teamId,
      type: "accusation",
      points: delta,
      payload: { attemptNo, correctCount: correctFields.length, penalty },
      createdAt: now,
    });
    return {
      attemptNo,
      correctCount: correctFields.length,
      totalFields: acc.fields.length,
      fullyCorrect,
      credit,
      penalty,
      delta,
      attemptsLeft: acc.max_attempts - attemptNo,
      locked: fullyCorrect || attemptNo >= acc.max_attempts,
    };
  });
  await recomputeLeaderboard(db, event.id);
  await bus().publish(topics.team(teamId), "accusation", { attemptNo: result.attemptNo });
  return result;
}

/* ─────────────────────────── Evidence board ─────────────────────────── */

export async function boardAllowedIds(db: Executor, event: EventRow, teamId: string): Promise<Set<string>> {
  const story = storyOf(event);
  if (!story) return new Set();
  const status = await evidenceStatus(db, event, teamId);
  return new Set([...[...status.revealed.keys()].map((id) => `ev:${id}`), ...story.suspects.map((s) => `sus:${s.id}`)]);
}

export async function getBoard(db: Executor, eventId: string, teamId: string): Promise<{ layout: BoardLayout; version: number }> {
  const [row] = await db.select().from(boardStates).where(eq(boardStates.teamId, teamId)).limit(1);
  if (!row || row.eventId !== eventId) return { layout: EMPTY_BOARD, version: 0 };
  return { layout: { ...EMPTY_BOARD, ...(row.layout as Partial<BoardLayout>) }, version: row.version };
}

/** Applies ops atomically on the latest server state — teammates never clobber each other. */
export async function updateBoard(db: Executor, event: EventRow, teamId: string, ops: BoardOp[]) {
  if (ops.length > 200) throw new GameError("invalid", "Too many board operations in one batch.");
  const allowed = await boardAllowedIds(db, event, teamId);
  const out = await db.transaction(async (tx) => {
    await tx.insert(boardStates).values({ teamId, eventId: event.id, layout: EMPTY_BOARD as never, version: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(boardStates).where(eq(boardStates.teamId, teamId)).for("update");
    const current = { ...EMPTY_BOARD, ...((row?.layout ?? {}) as Partial<BoardLayout>) };
    const layout = applyBoardOps(current, ops, allowed);
    const version = (row?.version ?? 0) + 1;
    await tx.update(boardStates).set({ layout: layout as never, version, updatedAt: new Date() }).where(eq(boardStates.teamId, teamId));
    return { layout, version };
  });
  await bus().publish(topics.team(teamId), "board", { version: out.version });
  return out;
}
