import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Executor } from "../db/client";
import { boardStates, challengeInstances, checkpointScans, eventLog, evidenceReveals, hintPurchases, submissions, teams } from "../db/schema";
import { env } from "../env";
import { bus, topics } from "../realtime/bus";
import { hmacSha256 } from "../security/crypto";
import { checkBlocked, clearKey, hitWindow, recordFailure, SUBMISSION_BACKOFF } from "../security/ratelimit";
import { eventPhase } from "../engine/event";
import { GameError } from "../engine/errors";
import { getLeaderboard, recomputeLeaderboard } from "../engine/leaderboard";
import { currentValue } from "../engine/scoring";
import type { EventRow, TeamRow } from "../engine/types";
import { EMPTY_BOARD, type BoardLayout } from "../../lib/board";
import { hintCost, type NodeDef } from "./core/blueprint";
import { evaluateGate, explainGate, opensAt, type GateLine } from "./core/gates";
import { describeEvent, reduceAll, type GameState, type StateEvent, type StateEventBody } from "./core/state";
import { compiledFor, type Compiled } from "./compile";
import { appendEvents, loadState, recentEvents, saveSnapshot } from "./journal";
import { artifactUrl, siteUrl } from "./links";
import type { Feedback, PrimitiveRuntime, Transition } from "./primitives/types";
import { runSandboxQuery, SqlError } from "./sql-sandbox";
import { buildWorld, cachedWorld, renderText, type NodeInstance, type TeamWorld } from "./world";

/**
 * The DOSSIER engine. Every state change goes through `dispatch`:
 *
 *   action → schema → availability → rate limit → primitive.validateAction
 *          → primitive.applyAction → Transition
 *          → (one transaction, team row locked) journal + ledger + submissions
 *          → settle(): gates re-evaluated to a fixpoint → unlocks / evidence
 *          → snapshot → leaderboard → realtime signal
 *
 * Clients never mutate state; they send actions and receive projections.
 */

export type NodeAvailability = "open" | "solved" | "failed" | "locked" | "scheduled";

export interface EngineCtx {
  event: EventRow;
  compiled: Compiled;
  team: TeamRow;
}

/* ─────────────────────────── Loading ─────────────────────────── */

export function requireCompiled(event: EventRow): Compiled {
  const c = compiledFor(event);
  if (!c) throw new GameError("not_found", "This event has not been published yet.");
  return c;
}

export async function loadTeamRow(db: Executor, eventId: string, teamId: string): Promise<TeamRow> {
  const [t] = await db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.eventId, eventId))).limit(1);
  if (!t) throw new GameError("unauthorized", "Unknown team.");
  return t;
}

export function stateOptions(c: Compiled) {
  return { phase: c.bp.acts[0]?.phase ?? "briefing", hintTokens: c.bp.hintEconomy.startingTokens };
}

export function worldFor(event: EventRow, c: Compiled, teamId: string): Promise<TeamWorld> {
  return cachedWorld(`${event.id}:${c.version}:${teamId}`, () => buildWorld(c.bp, { secret: env().ANSWER_SECRET, eventId: event.id, teamId }));
}

/** May this team act right now? Playtest teams can play drafts and paused events. */
export function assertTeamCanPlay(event: EventRow, team: TeamRow, now = new Date()) {
  if (team.status === "disqualified") throw new GameError("disqualified", "This team has been disqualified.");
  if (team.kind === "playtest") return;
  const phase = eventPhase(event, now);
  if (phase === "standby") throw new GameError("event_not_live", "The event has not started yet.");
  if (phase === "paused") throw new GameError("event_paused", "The event is paused. Actions resume shortly.");
  if (phase === "ended") throw new GameError("event_ended", "The event has ended.");
}

function gameStarted(event: EventRow, team: TeamRow, now: Date) {
  return team.kind === "playtest" || eventPhase(event, now) !== "standby";
}

export function availability(n: NodeDef, s: GameState, now: Date): NodeAvailability {
  const ns = s.nodes[n.id];
  if (ns?.status === "solved") return "solved";
  if (ns?.status === "failed") return "failed";
  if (ns) return "open";
  if (evaluateGate(n.gate, s, { now })) return "open";
  const at = opensAt(n.gate);
  return at && Date.parse(at) > now.getTime() ? "scheduled" : "locked";
}

/* ─────────────────────────── Settling (unlock propagation) ─────────────────────────── */

function rewardEvents(n: NodeDef, s: GameState): StateEventBody[] {
  const out: StateEventBody[] = [];
  for (const e of n.rewards.evidence) if (!s.evidence[e]) out.push({ type: "evidence.gained", id: e, source: `node:${n.id}` });
  for (const [k, v] of Object.entries(n.rewards.flags)) out.push({ type: "flag.set", key: k, value: v });
  for (const [r, d] of Object.entries(n.rewards.resources)) if (d) out.push({ type: "resource.delta", resource: r as "intel" | "tokens" | "hints", delta: d, reason: n.title });
  if (n.rewards.phase) out.push({ type: "phase.set", phase: n.rewards.phase });
  for (const t of n.rewards.timeline) if (!s.timeline[t]) out.push({ type: "timeline.learned", id: t });
  for (const l of n.rewards.locations) if (!s.locations[l]) out.push({ type: "location.visited", id: l });
  return out;
}

/** Everything that should now be true but is not yet journaled (pure). */
export function pendingSettlement(c: Compiled, s: GameState, now: Date): StateEventBody[] {
  const out: StateEventBody[] = [];
  for (const n of c.bp.nodes) {
    const ns = s.nodes[n.id];
    if (!ns && evaluateGate(n.gate, s, { now })) out.push({ type: "node.unlocked", node: n.id, round: n.round, reason: n.gate ? "gate" : "start" });
    // Physical checkpoint nodes complete themselves when the checkpoint is confirmed.
    if (ns?.status === "unlocked" && (n.primitive === "qr-checkpoint" || n.primitive === "gps-checkpoint")) {
      const cp = (n.config as { checkpoint?: string }).checkpoint;
      if (cp && s.checkpoints[cp]) out.push({ type: "node.solved", node: n.id, points: n.scoring.points }, ...rewardEvents(n, s));
    }
  }
  for (const e of c.bp.evidence) if (e.gate && !s.evidence[e.id] && evaluateGate(e.gate, s, { now })) out.push({ type: "evidence.gained", id: e.id, source: "gate" });
  return out;
}

async function ledgerSolve(tx: Executor, event: EventRow, teamId: string, nodeId: string, fixedPoints: number | null, now: Date) {
  await tx.insert(eventLog).values({ eventId: event.id, teamId, type: "solve", challengeId: nodeId, points: fixedPoints, payload: {}, createdAt: now }).onConflictDoNothing();
}

async function materializeEvidence(tx: Executor, eventId: string, teamId: string, events: StateEvent[]) {
  const rows = events.filter((e): e is Extract<StateEvent, { type: "evidence.gained" }> => e.type === "evidence.gained");
  if (rows.length) await tx.insert(evidenceReveals).values(rows.map((e) => ({ eventId, teamId, evidenceId: e.id, source: e.source, revealedAt: new Date(e.at) }))).onConflictDoNothing();
}

/** Applies pending settlement to a fixpoint. Must run inside the team-locked transaction. */
async function settle(tx: Executor, ctx: EngineCtx, s: GameState, now: Date, actor: string): Promise<{ state: GameState; events: StateEvent[] }> {
  const all: StateEvent[] = [];
  if (!gameStarted(ctx.event, ctx.team, now)) return { state: s, events: all };
  for (let pass = 0; pass < 12; pass++) {
    const pending = pendingSettlement(ctx.compiled, s, now);
    if (!pending.length) break;
    const written = await appendEvents(tx, ctx.event.id, ctx.team.id, pending, actor === "team" ? "system" : actor, now);
    for (const e of written) if (e.type === "node.solved") await ledgerSolve(tx, ctx.event, ctx.team.id, e.node, null, now);
    await materializeEvidence(tx, ctx.event.id, ctx.team.id, written);
    s = reduceAll(s, written);
    all.push(...written);
  }
  return { state: s, events: all };
}

/**
 * Loads a team's state and settles anything due (time gates, event start, gates a board change satisfied).
 * Cheap when nothing is pending. `settled` lists what this call opened, for callers that answer it.
 */
export async function syncTeam(db: Executor, event: EventRow, teamId: string, now = new Date()): Promise<{ ctx: EngineCtx; state: GameState; settled: { unlocked: string[]; evidence: string[] } }> {
  const compiled = requireCompiled(event);
  const team = await loadTeamRow(db, event.id, teamId);
  const ctx: EngineCtx = { event, compiled, team };
  const opts = stateOptions(compiled);
  let state = await loadState(db, event.id, teamId, opts);
  const opened = { unlocked: [] as string[], evidence: [] as string[] };
  if (gameStarted(event, team, now) && pendingSettlement(compiled, state, now).length) {
    const settled = await db.transaction(async (tx) => {
      await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
      const fresh = await loadState(tx, event.id, teamId, opts);
      const r = await settle(tx, ctx, fresh, now, "system");
      if (r.events.length) await saveSnapshot(tx, r.state);
      return r;
    });
    state = settled.state;
    opened.unlocked = settled.events.filter((e) => e.type === "node.unlocked").map((e) => (e as Extract<StateEvent, { type: "node.unlocked" }>).node);
    opened.evidence = settled.events.filter((e) => e.type === "evidence.gained").map((e) => (e as Extract<StateEvent, { type: "evidence.gained" }>).id);
    // What the world did, so the presentation layer can answer it (a ripple through the newly opened file).
    await bus().publish(topics.team(teamId), "state", { reason: "settle", ...opened });
  }
  return { ctx, state, settled: opened };
}

/* ─────────────────────────── Commands ─────────────────────────── */

function fingerprint(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/** Records that an instance was issued to a team (fingerprints only — never the answer). */
async function issueInstance(db: Executor, event: EventRow, c: Compiled, teamId: string, ni: NodeInstance) {
  await db
    .insert(challengeInstances)
    .values({
      eventId: event.id,
      teamId,
      challengeId: ni.node.id,
      primitive: ni.node.primitive,
      blueprintVersion: c.version,
      seedFingerprint: fingerprint(ni.ctx.rng.seed),
      answerFingerprint: ni.instance.outputs.answer ? hmacSha256(env().ANSWER_SECRET, `inst:${ni.node.id}:${ni.instance.outputs.answer}`).slice(0, 16) : null,
    })
    .onConflictDoNothing();
}

export interface DispatchResult {
  feedback: Feedback;
  correct: boolean | null;
  solved: boolean;
  unlocked: { id: string; title: string }[];
  evidence: { id: string; title: string }[];
  discoveries: string[];
  pointsDelta: number;
  firstBlood: boolean;
  /** After a wrong attempt: cooldown before the next attempt (0 = none) and free attempts left before cooldowns start. */
  retryAfterMs: number;
  freeAttemptsLeft: number | null;
}

function instanceFor(world: TeamWorld, nodeId: string): NodeInstance {
  const ni = world.nodes.get(nodeId);
  if (!ni) throw new GameError("conflict", `This challenge failed to generate (${world.errors.get(nodeId) ?? "unknown error"}). Organisers have been notified.`);
  return ni;
}

async function boardLinks(db: Executor, teamId: string, eventId: string) {
  const [row] = await db.select().from(boardStates).where(eq(boardStates.teamId, teamId)).limit(1);
  if (!row || row.eventId !== eventId) return [];
  return ((row.layout as unknown as BoardLayout).links ?? []).map((l) => ({ from: l.from, to: l.to, label: l.label }));
}

export function runtimeFor(ctx: EngineCtx, ni: NodeInstance, world: TeamWorld, db: Executor, now: Date): PrimitiveRuntime {
  const ds = ni.primitive.sqlDataset;
  return {
    now,
    playtest: ctx.team.kind === "playtest",
    facts: world.facts,
    sql: ds ? (q: string) => runSandboxQuery(`${ctx.event.id}:${ctx.compiled.version}:${ctx.team.id}:${ni.node.id}`, () => ds(ni.instance), q) : undefined,
    boardLinks: () => boardLinks(db, ctx.team.id, ctx.event.id),
  };
}

function fillNode(events: StateEventBody[], nodeId: string): StateEventBody[] {
  return events.map((e) => ("node" in e && e.node === "" ? ({ ...e, node: nodeId } as StateEventBody) : e));
}

export async function dispatch(
  db: Executor,
  opts: { event: EventRow; teamId: string; nodeId: string; action: unknown; ip?: string | null; now?: Date; actor?: string },
): Promise<DispatchResult> {
  const now = opts.now ?? new Date();
  const { ctx, state: before } = await syncTeam(db, opts.event, opts.teamId, now);
  assertTeamCanPlay(ctx.event, ctx.team, now);
  const node = ctx.compiled.nodes.get(opts.nodeId);
  if (!node) throw new GameError("not_found", "Challenge not found.");
  const av = availability(node, before, now);
  if (av === "solved") throw new GameError("already_solved", "Already solved.");
  if (av === "failed") throw new GameError("attempts_exhausted", "No attempts remain for this challenge.");
  if (av === "locked") throw new GameError("locked", "This challenge is locked.");
  if (av === "scheduled") throw new GameError("scheduled", "This challenge is not open yet.", { opensAt: opensAt(node.gate) });

  const world = await worldFor(ctx.event, ctx.compiled, ctx.team.id);
  const ni = instanceFor(world, node.id);
  await issueInstance(db, ctx.event, ctx.compiled, ctx.team.id, ni);
  const parsed = ni.primitive.actionSchema.safeParse(opts.action);
  if (!parsed.success) throw new GameError("invalid", parsed.error.issues[0]?.message ?? "Invalid action.");
  const action = parsed.data as { type: string };
  const isAttempt = ni.primitive.isAttempt(action);

  // Rate limiting: separate per-team budgets for answer attempts and for exploration
  // (questions, queries, checks), plus per-node exponential backoff on wrong attempts.
  const burst = await hitWindow(db, isAttempt ? `att:${ctx.team.id}` : `act:${ctx.team.id}`, isAttempt ? 30 : 120, 60_000, now);
  if (!burst.ok) throw new GameError("rate_limited", "Too many actions. Slow down.", { retryAfterMs: burst.retryAfterMs });
  const key = `sub:${ctx.team.id}:${node.id}`;
  if (isAttempt) {
    const blocked = await checkBlocked(db, key, now);
    if (!blocked.ok) throw new GameError("rate_limited", "Cooling down after repeated wrong answers.", { retryAfterMs: blocked.retryAfterMs });
  }
  if (node.maxAttempts && isAttempt && Number(before.nodes[node.id]?.steps["attempts"] ?? 0) >= node.maxAttempts)
    throw new GameError("attempts_exhausted", "No attempts remain for this challenge.");

  const v = ni.primitive.validateAction(action, ni.instance, before.nodes[node.id], before);
  if (!v.ok) throw new GameError(v.code === "attempts_exhausted" ? "attempts_exhausted" : v.code === "conflict" ? "conflict" : "invalid", v.message);

  let t: Transition;
  try {
    t = await ni.primitive.applyAction(action, ni.instance, before.nodes[node.id], before, runtimeFor(ctx, ni, world, db, now));
  } catch (e) {
    if (e instanceof SqlError) throw new GameError(e.code === "timeout" ? "rate_limited" : "invalid", e.message);
    throw e;
  }

  const secret = env().ANSWER_SECRET;
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, ctx.team.id)).for("update");
    let s = await loadState(tx, ctx.event.id, ctx.team.id, stateOptions(ctx.compiled));
    if (s.nodes[node.id]?.status === "solved") throw new GameError("already_solved", "Already solved.");
    const bodies = fillNode(t.events, node.id);
    // First occurrence of a discovery key only.
    const known = new Set(s.discoveries[node.id] ?? []);
    const filtered = bodies.filter((b) => b.type !== "discovery" || !known.has(b.key));
    if (t.fail) filtered.push({ type: "node.failed", node: node.id, reason: "attempts exhausted" });
    const written = await appendEvents(tx, ctx.event.id, ctx.team.id, filtered, opts.actor ?? "team", now);
    s = reduceAll(s, written);
    const out: StateEvent[] = [...written];
    let ledgerDelta = 0;

    if (isAttempt) {
      const preview = t.submission ?? JSON.stringify(action).slice(0, 120);
      await tx.insert(submissions).values({
        eventId: ctx.event.id,
        teamId: ctx.team.id,
        challengeId: node.id,
        correct: t.correct === true,
        submittedHash: hmacSha256(secret, `fp:${node.id}:${preview.toLowerCase().trim()}`),
        preview: t.correct === true ? null : preview.slice(0, 120),
        ip: opts.ip ?? null,
        createdAt: now,
      });
    }
    if (t.ledgerPoints) {
      await tx.insert(eventLog).values({ eventId: ctx.event.id, teamId: ctx.team.id, type: "partial", challengeId: node.id, points: t.ledgerPoints, payload: { reason: t.ledgerReason ?? "" }, createdAt: now });
      const pw = await appendEvents(tx, ctx.event.id, ctx.team.id, [{ type: "partial.awarded", node: node.id, points: t.ledgerPoints, reason: t.ledgerReason ?? "" }], "system", now);
      s = reduceAll(s, pw);
      out.push(...pw);
      ledgerDelta += t.ledgerPoints;
    }
    let firstBlood = false;
    if (t.solved) {
      const [{ n: prior } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(eventLog)
        .innerJoin(teams, eq(teams.id, eventLog.teamId))
        .where(and(eq(eventLog.eventId, ctx.event.id), eq(eventLog.challengeId, node.id), eq(eventLog.type, "solve"), eq(teams.status, "active"), eq(teams.kind, "player")));
      firstBlood = ctx.team.kind === "player" && Number(prior) === 0 && t.solvePoints === undefined;
      const value =
        t.solvePoints ??
        currentValue({ family: "", points: node.scoring.points, firstBloodBonus: 0, dynamic: node.scoring.dynamic }, Number(prior)) + (firstBlood ? node.scoring.firstBloodBonus : 0);
      const sw = await appendEvents(tx, ctx.event.id, ctx.team.id, [{ type: "node.solved", node: node.id, points: value }, ...rewardEvents(node, s)], "system", now);
      await ledgerSolve(tx, ctx.event, ctx.team.id, node.id, t.solvePoints ?? null, now);
      s = reduceAll(s, sw);
      out.push(...sw);
      ledgerDelta += value;
    }
    for (const e of written)
      if (e.type === "checkpoint.confirmed")
        await tx
          .insert(checkpointScans)
          .values({ eventId: ctx.event.id, checkpointId: e.id, teamId: ctx.team.id, status: "confirmed", method: "gps", points: 0, decidedBy: "gps", decidedAt: now, createdAt: now })
          .onConflictDoNothing();
    const settled = await settle(tx, ctx, s, now, "system");
    s = settled.state;
    out.push(...settled.events);
    await materializeEvidence(tx, ctx.event.id, ctx.team.id, out);
    await saveSnapshot(tx, s);
    return { state: s, events: out, ledgerDelta, firstBlood };
  });

  let retryAfterMs = 0;
  let freeAttemptsLeft: number | null = null;
  if (isAttempt) {
    if (t.correct === false) {
      const r = await recordFailure(db, key, SUBMISSION_BACKOFF, now);
      retryAfterMs = r.retryAfterMs;
      freeAttemptsLeft = Math.max(0, r.remaining);
    } else if (t.correct === true) await clearKey(db, key);
  }
  if (result.ledgerDelta !== 0 || t.solved) await recomputeLeaderboard(db, ctx.event.id);

  const unlocked = result.events.filter((e): e is Extract<StateEvent, { type: "node.unlocked" }> => e.type === "node.unlocked").map((e) => ({ id: e.node, title: ctx.compiled.nodes.get(e.node)?.title ?? e.node }));
  const gained = result.events.filter((e): e is Extract<StateEvent, { type: "evidence.gained" }> => e.type === "evidence.gained").map((e) => ({ id: e.id, title: ctx.compiled.evidence.get(e.id)?.title ?? e.id }));
  const discoveries = result.events.filter((e): e is Extract<StateEvent, { type: "discovery" }> => e.type === "discovery").map((e) => e.label);
  await bus().publish(topics.team(ctx.team.id), "state", { node: node.id, solved: Boolean(t.solved), unlocked: unlocked.map((u) => u.id), evidence: gained.map((g) => g.id) });
  await bus().publish(topics.staff(ctx.event.id), "activity", { team: ctx.team.id, node: node.id, correct: t.correct, solved: Boolean(t.solved) });
  if (result.firstBlood) await bus().publish(topics.event(ctx.event.id), "first-blood", { challengeId: node.id, title: node.title });
  return {
    feedback: t.feedback,
    correct: t.correct,
    solved: Boolean(t.solved),
    unlocked,
    evidence: gained,
    discoveries,
    pointsDelta: result.ledgerDelta,
    firstBlood: result.firstBlood,
    retryAfterMs,
    freeAttemptsLeft,
  };
}

/** Journals discoveries made inside a synthetic site (first time only per key). */
export async function recordDiscovery(db: Executor, event: EventRow, teamId: string, nodeId: string, key: string, label: string) {
  const { ctx } = await syncTeam(db, event, teamId);
  if (!gameStarted(event, ctx.team, new Date())) return false;
  const added = await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
    let s = await loadState(tx, event.id, teamId, stateOptions(ctx.compiled));
    if ((s.discoveries[nodeId] ?? []).includes(key)) return false;
    const w = await appendEvents(tx, event.id, teamId, [{ type: "discovery", node: nodeId, key, label }], "team");
    s = reduceAll(s, w);
    const r = await settle(tx, ctx, s, new Date(), "system");
    await saveSnapshot(tx, r.state);
    return true;
  });
  if (added) await bus().publish(topics.team(teamId), "state", { discovery: label });
  return added;
}

/** Journals an artifact download as an inventory item (first time only). */
export async function recordArtifact(db: Executor, event: EventRow, teamId: string, nodeId: string, name: string) {
  const c = requireCompiled(event);
  const s = await loadState(db, event.id, teamId, stateOptions(c));
  if (s.inventory.some((i) => i.node === nodeId && i.name === name)) return;
  await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
    const fresh = await loadState(tx, event.id, teamId, stateOptions(c));
    if (fresh.inventory.some((i) => i.node === nodeId && i.name === name)) return;
    const w = await appendEvents(tx, event.id, teamId, [{ type: "artifact.obtained", node: nodeId, name }], "team");
    await saveSnapshot(tx, reduceAll(fresh, w));
  });
}

/* ─────────────────────────── Hints ─────────────────────────── */

export async function takeHint(db: Executor, opts: { event: EventRow; teamId: string; nodeId: string; index: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const { ctx, state } = await syncTeam(db, opts.event, opts.teamId, now);
  assertTeamCanPlay(ctx.event, ctx.team, now);
  const node = ctx.compiled.nodes.get(opts.nodeId);
  if (!node) throw new GameError("not_found", "Challenge not found.");
  if (availability(node, state, now) !== "open") throw new GameError("locked", "Hints are only available for open challenges.");
  const hint = node.hints[opts.index];
  if (!hint || !Number.isInteger(opts.index)) throw new GameError("not_found", "Hint not found.");
  const taken = state.nodes[node.id]?.hints ?? [];
  const world = await worldFor(ctx.event, ctx.compiled, ctx.team.id);
  const text = renderText(hint.text, world.facts);
  if (taken.includes(opts.index)) return { text, cost: hintCost(ctx.compiled.bp, hint), alreadyOwned: true };
  for (let i = 0; i < opts.index; i++) if (!taken.includes(i)) throw new GameError("conflict", "Unlock earlier hints first.");
  const cost = hintCost(ctx.compiled.bp, hint);
  const currency = ctx.compiled.bp.hintEconomy.currency;
  if (currency === "tokens" && state.resources.hints < cost) throw new GameError("conflict", `You need ${cost} hint token${cost === 1 ? "" : "s"}.`);
  await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, ctx.team.id)).for("update");
    const s = await loadState(tx, ctx.event.id, ctx.team.id, stateOptions(ctx.compiled));
    if ((s.nodes[node.id]?.hints ?? []).includes(opts.index)) return;
    const w = await appendEvents(tx, ctx.event.id, ctx.team.id, [{ type: "hint.taken", node: node.id, index: opts.index, level: hint.level, cost, currency }], "team", now);
    await tx.insert(hintPurchases).values({ eventId: ctx.event.id, teamId: ctx.team.id, challengeId: node.id, hintIndex: opts.index, cost, createdAt: now }).onConflictDoNothing();
    if (currency === "points" && cost > 0) await tx.insert(eventLog).values({ eventId: ctx.event.id, teamId: ctx.team.id, type: "hint", challengeId: node.id, points: -cost, payload: { index: opts.index, level: hint.level }, createdAt: now });
    await saveSnapshot(tx, reduceAll(s, w));
  });
  if (currency === "points" && cost > 0) await recomputeLeaderboard(db, ctx.event.id);
  await bus().publish(topics.team(ctx.team.id), "state", { hint: node.id });
  // The Control Room sees who asked for help, and where, as it happens.
  await bus().publish(topics.staff(ctx.event.id), "activity", { team: ctx.team.id, node: node.id, hint: true });
  return { text, cost, alreadyOwned: false };
}

/* ─────────────────────────── Projections ─────────────────────────── */

export interface NodeCard {
  id: string;
  state: NodeAvailability;
  title: string | null;
  primitive: string;
  family: string;
  estimatedMinutes: number;
  points: number;
  optional: boolean;
  requirements: GateLine[];
  opensAt: string | null;
  isNew: boolean;
  position: { x: number; y: number } | null;
  category: string | null;
}

export interface RoundView {
  id: string;
  title: string;
  family: string;
  tier: string;
  intro: string;
  unlocked: boolean;
  nodes: NodeCard[];
}

export interface ActView {
  id: string;
  title: string;
  summary: string;
  rounds: RoundView[];
  started: boolean;
  complete: boolean;
}

export interface FeedItem {
  seq: number;
  at: string;
  type: string;
  text: string;
  node: string | null;
}

export interface TeamOverview {
  phase: string;
  story: { title: string; codename: string; premise: string; briefing: string };
  acts: ActView[];
  objective: { title: string; detail: string; nodes: { id: string; title: string }[] };
  resources: GameState["resources"];
  counts: { solved: number; open: number; total: number; evidence: number; evidenceTotal: number };
  feed: FeedItem[];
  currentAct: string | null;
}

export function namer(c: Compiled, s: GameState | null) {
  return (kind: "node" | "evidence" | "checkpoint" | "character" | "location" | "timeline", id: string): string => {
    if (kind === "node") {
      const n = c.nodes.get(id);
      return n && (!s || s.nodes[id]) ? n.title : "a classified file";
    }
    if (kind === "evidence") return c.evidence.get(id)?.title ?? id;
    if (kind === "checkpoint") return c.bp.checkpoints.find((x) => x.id === id)?.name ?? id;
    if (kind === "character") return c.bp.story.characters.find((x) => x.id === id)?.name ?? id;
    if (kind === "location") return c.bp.story.locations.find((x) => x.id === id)?.name ?? id;
    return c.bp.story.timeline.find((x) => x.id === id)?.title ?? id;
  };
}

export function nodeCard(c: Compiled, n: NodeDef, s: GameState, now: Date, solveCounts: Record<string, number>): NodeCard {
  const av = availability(n, s, now);
  const visible = av === "open" || av === "solved" || av === "failed";
  const name = namer(c, s);
  return {
    id: n.id,
    state: av,
    title: visible ? n.title : null,
    primitive: n.primitive,
    family: c.bp.rounds.find((r) => r.id === n.round)?.family ?? "custom",
    estimatedMinutes: n.estimatedMinutes,
    points: currentValue({ family: "", points: n.scoring.points, firstBloodBonus: 0, dynamic: n.scoring.dynamic }, solveCounts[n.id] ?? 0),
    optional: n.optional,
    requirements: visible ? [] : explainGate(n.gate, s, { now }, (k, id) => (k === "node" ? (s.nodes[id] ? (c.nodes.get(id)?.title ?? null) : null) : k === "evidence" ? (s.evidence[id] ? name("evidence", id) : null) : name("checkpoint", id))),
    opensAt: av === "scheduled" ? opensAt(n.gate) : null,
    isNew: av === "open" && Object.keys(s.nodes[n.id]?.steps ?? {}).length === 0 && (s.nodes[n.id]?.hints.length ?? 0) === 0,
    position: n.position ?? null,
    category: n.category ?? null,
  };
}

export async function teamOverview(db: Executor, event: EventRow, teamId: string, now = new Date()): Promise<TeamOverview> {
  const { ctx, state } = await syncTeam(db, event, teamId, now);
  const c = ctx.compiled;
  const lb = await getLeaderboard(db, event.id, "public");
  const cards = new Map(c.bp.nodes.map((n) => [n.id, nodeCard(c, n, state, now, lb.solveCounts)]));
  const acts: ActView[] = c.bp.acts.map((a) => {
    const rs = c.bp.rounds.filter((r) => r.act === a.id);
    const rounds: RoundView[] = rs.map((r) => {
      const nodes = c.bp.nodes.filter((n) => n.round === r.id).map((n) => cards.get(n.id)!);
      return { id: r.id, title: r.title, family: r.family, tier: r.tier, intro: r.intro, unlocked: nodes.some((x) => x.state !== "locked" && x.state !== "scheduled"), nodes };
    });
    const all = rounds.flatMap((r) => r.nodes).filter((x) => !x.optional);
    return { id: a.id, title: a.title, summary: a.summary, rounds, started: rounds.some((r) => r.unlocked), complete: all.length > 0 && all.every((x) => x.state === "solved") };
  });
  const open = [...cards.values()].filter((x) => x.state === "open");
  const currentAct = acts.find((a) => a.started && !a.complete)?.id ?? acts.filter((a) => a.started).at(-1)?.id ?? null;
  const mainOpen = open.filter((x) => !x.optional);
  const objective =
    open.length === 0
      ? [...cards.values()].every((x) => x.state === "solved" || x.optional)
        ? { title: "Case closed", detail: "Every file in this investigation is solved.", nodes: [] }
        : { title: "Waiting on the investigation", detail: "Nothing is open right now. Check the requirements on locked files, or visit a field checkpoint.", nodes: [] }
      : {
          title: acts.find((a) => a.id === currentAct)?.title ?? "Investigate",
          detail: `${mainOpen.length || open.length} open file${(mainOpen.length || open.length) === 1 ? "" : "s"}. ${mainOpen.some((x) => x.isNew) ? "Some are untouched." : "Keep pulling threads."}`,
          nodes: (mainOpen.length ? mainOpen : open).slice(0, 4).map((x) => ({ id: x.id, title: x.title! })),
        };
  const events = await recentEvents(db, event.id, teamId, 40);
  const name = namer(c, state);
  const feed: FeedItem[] = events
    .map((e) => ({ seq: e.seq, at: e.at, type: e.type, text: describeEvent(e, name) ?? "", node: "node" in e ? ((e as { node?: string }).node ?? null) : null }))
    .filter((f) => f.text);
  return {
    phase: state.narrativePhase,
    story: { title: c.bp.story.title, codename: c.bp.story.codename, premise: c.bp.story.premise, briefing: c.bp.story.briefing },
    acts,
    objective,
    resources: state.resources,
    counts: {
      solved: [...cards.values()].filter((x) => x.state === "solved").length,
      open: open.length,
      total: cards.size,
      evidence: Object.keys(state.evidence).length,
      evidenceTotal: c.bp.evidence.length,
    },
    feed,
    currentAct,
  };
}

export interface NodeDetail {
  card: NodeCard;
  round: { id: string; title: string; family: string; tier: string };
  act: { id: string; title: string };
  briefing: string;
  view: unknown;
  hints: { index: number; level: string; cost: number; currency: string; text: string | null; purchasable: boolean }[];
  artifacts: { name: string; mime: string; description: string; url: string; obtained: string | null }[];
  site: { url: string; title: string } | null;
  checkpoint: { id: string; name: string; location: string; instructions: string; kind: string } | null;
  discoveries: string[];
  skills: string[];
  tools: string[];
  solvedAt: string | null;
  error: string | null;
}


export async function nodeDetail(db: Executor, event: EventRow, teamId: string, nodeId: string, now = new Date()): Promise<NodeDetail | null> {
  const { ctx, state } = await syncTeam(db, event, teamId, now);
  const c = ctx.compiled;
  const n = c.nodes.get(nodeId);
  if (!n) return null;
  const lb = await getLeaderboard(db, event.id, "public");
  const card = nodeCard(c, n, state, now, lb.solveCounts);
  const round = c.bp.rounds.find((r) => r.id === n.round)!;
  const act = c.bp.acts.find((a) => a.id === round.act)!;
  const base = { card, round: { id: round.id, title: round.title, family: round.family, tier: round.tier }, act: { id: act.id, title: act.title } };
  const an = c.analysis.nodes.get(n.id);
  if (card.state === "locked" || card.state === "scheduled")
    return { ...base, briefing: "", view: null, hints: [], artifacts: [], site: null, checkpoint: null, discoveries: [], skills: [], tools: [], solvedAt: null, error: null };

  const world = await worldFor(event, c, teamId);
  const ni = world.nodes.get(n.id);
  const error = ni ? null : (world.errors.get(n.id) ?? "failed to generate");
  if (ni) await issueInstance(db, event, c, teamId, ni);
  const ns = state.nodes[n.id];
  const taken = ns?.hints ?? [];
  const hints = n.hints.map((h, index) => ({
    index,
    level: h.level,
    cost: hintCost(c.bp, h),
    currency: c.bp.hintEconomy.currency,
    text: taken.includes(index) ? renderText(h.text, world.facts) : null,
    purchasable: card.state === "open" && !taken.includes(index) && n.hints.slice(0, index).every((_, i) => taken.includes(i)),
  }));
  const artifacts = ni?.primitive.artifacts
    ? ni.primitive.artifacts(ni.instance, ni.ctx).map((a) => ({
        name: a.name,
        mime: a.mime,
        description: a.description,
        url: artifactUrl(event.id, teamId, n.id, a.name),
        obtained: state.inventory.find((i) => i.node === n.id && i.name === a.name)?.at ?? null,
      }))
    : [];
  const siteId = ni?.primitive.site ? ni.primitive.site(ni.instance, ni.ctx)?.site : undefined;
  const siteDef = siteId ? c.bp.sites.find((x) => x.id === siteId) : undefined;
  const cpId = (n.config as { checkpoint?: string }).checkpoint;
  const cp = cpId ? c.bp.checkpoints.find((x) => x.id === cpId) : undefined;
  const view = ni ? ni.primitive.view(ni.instance, ns, state) : null;
  return {
    ...base,
    briefing: renderText(n.briefing, world.facts),
    view,
    hints,
    artifacts,
    site: siteId ? { url: siteUrl(event.id, teamId, siteId), title: siteDef?.title ?? siteId } : null,
    checkpoint: cp ? { id: cp.id, name: cp.name, location: cp.location, instructions: cp.instructions, kind: cp.kind } : null,
    discoveries: (state.discoveries[n.id] ?? []).map((k) => k),
    skills: an?.skills ?? [],
    tools: an?.tools ?? [],
    solvedAt: ns?.solvedAt ?? null,
    error,
  };
}

/* ─────────────────────────── Case file (evidence, people, timeline) ─────────────────────────── */

export interface EvidenceItemView {
  id: string;
  title: string;
  kind: string;
  summary: string;
  body: string;
  at: string;
  source: string;
  isNew: boolean;
  about: { characters: { id: string; name: string }[]; locations: { id: string; name: string }[] };
  /** The file that produced it, when this team has that file open or closed (never a sealed one). */
  from: { id: string; title: string } | null;
}

export async function caseFileView(db: Executor, event: EventRow, teamId: string, now = new Date()) {
  const { ctx, state } = await syncTeam(db, event, teamId, now);
  const c = ctx.compiled;
  const world = await worldFor(event, c, teamId);
  const seen = await db.select().from(evidenceReveals).where(and(eq(evidenceReveals.eventId, event.id), eq(evidenceReveals.teamId, teamId)));
  const seenMap = new Map(seen.map((r) => [r.evidenceId, Boolean(r.seenAt)]));
  const char = new Map(c.bp.story.characters.map((x) => [x.id, x]));
  const loc = new Map(c.bp.story.locations.map((x) => [x.id, x]));
  const evidence: EvidenceItemView[] = [];
  for (const [id, meta] of Object.entries(state.evidence)) {
    const e = c.evidence.get(id);
    if (!e) continue;
    evidence.push({
      id,
      title: e.title,
      kind: e.kind,
      summary: renderText(e.summary, world.facts),
      body: renderText(e.body, world.facts),
      at: meta.at,
      source: meta.source,
      isNew: !seenMap.get(id),
      from: (() => {
        const src = meta.source.startsWith("node:") ? c.nodes.get(meta.source.slice(5)) : undefined;
        return src && state.nodes[src.id] ? { id: src.id, title: src.title } : null;
      })(),
      about: {
        characters: e.about.characters.map((x) => ({ id: x, name: char.get(x)?.name ?? x })),
        locations: e.about.locations.map((x) => ({ id: x, name: loc.get(x)?.name ?? x })),
      },
    });
  }
  evidence.sort((a, b) => a.at.localeCompare(b.at));
  const known = (t: (typeof c.bp.story.timeline)[number]) => t.public || state.timeline[t.id] || (t.requiresEvidence && state.evidence[t.requiresEvidence]);
  const timeline = c.bp.story.timeline.filter(known).map((t) => ({ id: t.id, at: t.at, title: t.title, body: renderText(t.body, world.facts) }));
  // Next scheduled evidence release (time-gated evidence only).
  const upcoming = c.bp.evidence
    .filter((e) => !state.evidence[e.id] && e.gate && "after" in e.gate && Date.parse(e.gate.after) > now.getTime())
    .map((e) => new Date((e.gate as { after: string }).after).toISOString())
    .sort();
  const ended = eventPhase(event, now) === "ended";
  const finalNode = c.bp.nodes.find((n) => n.primitive === "final-reconstruction");
  const labelFor = (type: string, id: string, options: { id: string; label: string }[]) =>
    options.find((o) => o.id === id)?.label ?? (type === "suspect" ? char.get(id)?.name : type === "location" ? loc.get(id)?.name : type === "evidence" ? c.evidence.get(id)?.title : undefined) ?? id;
  const solution =
    ended && finalNode
      ? {
          md: c.bp.story.truth.explanation,
          answers: ((finalNode.config as { fields?: { label: string; type: string; answer: string[]; options?: { id: string; label: string }[] }[] }).fields ?? []).map((f) => ({
            field: f.label,
            value: renderText(labelFor(f.type, f.answer[0]!, f.options ?? []), world.facts),
          })),
        }
      : null;
  return {
    story: { title: c.bp.story.title, codename: c.bp.story.codename, premise: c.bp.story.premise, briefing: renderText(c.bp.story.briefing, world.facts) },
    characters: c.bp.story.characters.map((x) => ({ id: x.id, name: x.name, role: x.role, bio: renderText(x.bio, world.facts), suspect: x.suspect, relationships: x.relationships.map((r) => ({ to: char.get(r.to)?.name ?? r.to, kind: r.kind })) })),
    locations: c.bp.story.locations.map((x) => ({ id: x.id, name: x.name, description: x.description, visited: Boolean(state.locations[x.id]) })),
    evidence,
    sealed: c.bp.evidence.length - evidence.length,
    nextReleaseAt: upcoming[0] ?? null,
    timeline,
    hiddenTimeline: c.bp.story.timeline.length - timeline.length,
    solution,
    contradictions: Object.entries(state.contradictions).map(([id, x]) => ({ id, label: x.label, suspect: char.get(x.suspect)?.name ?? x.suspect, at: x.at })),
    inventory: state.inventory,
  };
}

/* ─────────────────────────── Evidence board ─────────────────────────── */

export async function boardItems(db: Executor, event: EventRow, teamId: string) {
  const file = await caseFileView(db, event, teamId);
  return [
    ...file.evidence.map((e) => ({ id: `ev:${e.id}`, kind: "evidence" as const, title: e.title, subtitle: e.kind, evidenceKind: e.kind, href: `/play/case/evidence/${e.id}`, isNew: e.isNew, summary: e.summary })),
    ...file.characters.map((x) => ({ id: `sus:${x.id}`, kind: "suspect" as const, title: x.name, subtitle: x.role || (x.suspect ? "suspect" : "person"), href: "/play/case#people", isNew: false, summary: "" })),
    ...file.locations.map((x) => ({ id: `loc:${x.id}`, kind: "location" as const, title: x.name, subtitle: "location" })),
    ...file.timeline.map((t) => ({ id: `tl:${t.id}`, kind: "timeline" as const, title: t.title, subtitle: t.at })),
  ];
}

/**
 * Open evidence-board deductions for this team. The wall offers to submit itself to them — the same
 * action, through the same dispatch pipeline, as the file's own page. Only files the team can open now.
 */
export async function theoryDesks(db: Executor, event: EventRow, teamId: string, now = new Date()): Promise<{ id: string; title: string; required: number; maxUnsupported: number }[]> {
  const { ctx, state } = await syncTeam(db, event, teamId, now);
  const out: { id: string; title: string; required: number; maxUnsupported: number }[] = [];
  for (const node of ctx.compiled.nodes.values()) {
    if (node.primitive !== "board-deduction" || availability(node, state, now) !== "open") continue;
    const cfg = node.config as { required?: number; maxUnsupported?: number };
    out.push({ id: node.id, title: node.title, required: cfg.required ?? 4, maxUnsupported: cfg.maxUnsupported ?? 3 });
  }
  return out;
}

export async function getBoard(db: Executor, eventId: string, teamId: string): Promise<{ layout: BoardLayout; version: number }> {
  const [row] = await db.select().from(boardStates).where(eq(boardStates.teamId, teamId)).limit(1);
  if (!row || row.eventId !== eventId) return { layout: EMPTY_BOARD, version: 0 };
  return { layout: { ...EMPTY_BOARD, ...(row.layout as Partial<BoardLayout>) }, version: row.version };
}

export async function solveCountsFor(db: Executor, eventId: string) {
  return (await getLeaderboard(db, eventId, "public")).solveCounts;
}

