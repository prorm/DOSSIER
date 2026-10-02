import { and, eq, ne } from "drizzle-orm";
import type { Executor } from "../db/client";
import { gameStates, teams } from "../db/schema";
import type { GameState } from "./core/state";
import { env } from "../env";
import { getLeaderboard } from "../engine/leaderboard";
import type { EventRow } from "../engine/types";
import { hmacSha256 } from "../security/crypto";
import { deriveCaseNumber } from "../../lib/experience/variation";
import type { UActIn, UEdgeIn, UNodeIn, UniverseInput } from "../../lib/experience/universe";
import { compiledFor } from "./compile";
import { nodeCard, syncTeam, type NodeCard } from "./engine";
import { presentationOf } from "../views";

/**
 * PRESENTATION STATE, server half.
 *
 * These projections turn a team's authoritative game state into what the
 * *visual layer* may show. They add no facts and change no rules; their job is
 * to be player-safe: a classified file has no title, unknown edges are never
 * drawn, and fact-flow (which file's output feeds which) is never revealed.
 */

/** Cosmetic identity for a team's world. An HMAC of a distinct scope, so it can never leak the answer seed. */
/** 16 hex characters of a keyed hash (hmacSha256 speaks base64url; the visual layer wants hex so every character carries entropy). */
function hex16(scope: string): string {
  return Buffer.from(hmacSha256(env().ANSWER_SECRET, scope), "base64url").toString("hex").slice(0, 16);
}

export function presentationFingerprint(eventId: string, teamId: string): string {
  return hex16(`pres:${eventId}:${teamId}`);
}

export interface UniverseView extends UniverseInput {
  fingerprint: string;
  layoutSeed: string;
  phase: string;
  counts: { solved: number; open: number; total: number; evidence: number; evidenceTotal: number };
}

const isKnown = (s: NodeCard["state"]) => s === "open" || s === "solved" || s === "failed";

export async function universeView(db: Executor, event: EventRow, teamId: string, now = new Date()): Promise<UniverseView> {
  const { ctx, state } = await syncTeam(db, event, teamId, now);
  const c = ctx.compiled;
  const lb = await getLeaderboard(db, event.id, "public");
  const cards = new Map<string, NodeCard>(c.bp.nodes.map((n) => [n.id, nodeCard(c, n, state, now, lb.solveCounts)]));

  const actIndex = new Map(c.bp.acts.map((a, i) => [a.id, i]));
  const roundIndex = new Map(c.bp.rounds.map((r, i) => [r.id, i]));
  const perRound = new Map<string, string[]>();
  for (const n of c.bp.nodes) perRound.set(n.round, [...(perRound.get(n.round) ?? []), n.id]);

  // Revealed structure: a thread is drawn only from a file the team already knows.
  // Only prerequisite ("gate") and checkpoint edges — fact flow between files is the puzzle, never the picture.
  const revealed: UEdgeIn[] = [];
  const seen = new Set<string>();
  const parentsKnown = new Set<string>();
  for (const e of c.analysis.edges) {
    if (e.kind !== "gate" && e.kind !== "checkpoint") continue;
    const from = cards.get(e.from);
    const to = cards.get(e.to);
    if (!from || !to || !isKnown(from.state)) continue;
    if (e.hidden && !isKnown(to.state)) continue;
    const key = `${e.from}>${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    revealed.push({ from: e.from, to: e.to, kind: e.kind });
    parentsKnown.add(e.to);
  }

  const nodes: UNodeIn[] = c.bp.nodes.map((n) => {
    const card = cards.get(n.id)!;
    const round = c.bp.rounds.find((r) => r.id === n.round)!;
    const ns = state.nodes[n.id];
    const req = card.requirements;
    const okRatio = req.length ? req.filter((r) => r.ok).length / req.length : 0;
    const interviewSuspect = n.primitive === "interview" ? (n.config as { suspect?: string }).suspect : undefined;
    const locked = card.state === "locked";
    return {
      id: n.id,
      title: card.title,
      state: card.state,
      family: card.family,
      actIndex: actIndex.get(round.act) ?? 0,
      roundIndex: roundIndex.get(round.id) ?? 0,
      indexInRound: perRound.get(n.round)!.indexOf(n.id),
      roundSize: perRound.get(n.round)!.length,
      points: card.points,
      minutes: card.estimatedMinutes,
      optional: card.optional,
      isNew: card.isNew,
      opensAt: card.opensAt,
      progress: locked ? Math.max(okRatio, parentsKnown.has(n.id) ? 0.25 : 0) : 1,
      requirements: req,
      signals: {
        discoveries: (state.discoveries[n.id] ?? []).length,
        contradictions: interviewSuspect ? (state.suspects[interviewSuspect]?.contradictions.length ?? 0) : 0,
        wrong: Number(ns?.steps["attempts"] ?? 0) || 0,
        hints: ns?.hints.length ?? 0,
      },
    };
  });

  const acts: UActIn[] = c.bp.acts.map((a) => {
    const rs = c.bp.rounds.filter((r) => r.act === a.id);
    const ns = nodes.filter((n) => rs.some((r) => perRound.get(r.id)?.includes(n.id)));
    const started = ns.some((n) => n.state !== "locked" && n.state !== "scheduled");
    const req = ns.filter((n) => !n.optional);
    return { id: a.id, title: started ? a.title : null, started, complete: req.length > 0 && req.every((n) => n.state === "solved") };
  });

  const all = [...cards.values()];
  return {
    nodes,
    edges: revealed,
    acts,
    fingerprint: presentationFingerprint(event.id, teamId),
    layoutSeed: `${event.id}:${c.version}`,
    phase: state.narrativePhase,
    counts: {
      solved: all.filter((x) => x.state === "solved").length,
      open: all.filter((x) => x.state === "open").length,
      total: all.length,
      evidence: Object.keys(state.evidence).length,
      evidenceTotal: c.bp.evidence.length,
    },
  };
}

/* ─────────────────────────── Opening sequence context ─────────────────────────── */

export interface CinematicContext {
  eventId: string;
  eventName: string;
  teamName: string;
  caseNumber: string;
  title: string;
  kicker: string;
  codename: string;
  extraLines: string[];
  world: string;
  counts: UniverseView["counts"] & { acts: number };
  /** Evidence flags for the shard formation: true = held. */
  evidence: boolean[];
  intensity: "calm" | "balanced" | "cinematic";
}

/**
 * The real numbers an opening sequence is allowed to quote. Everything the
 * cinematic prints ("22 files", "13 exhibits held") is read from here, so the
 * opening is a truthful boot log of *this team's* world, not a canned animation.
 */
export async function cinematicContext(db: Executor, event: EventRow, teamId: string, teamName: string, universe?: UniverseView): Promise<CinematicContext> {
  const { ctx, state } = await syncTeam(db, event, teamId);
  const c = ctx.compiled;
  const u = universe ?? (await universeView(db, event, teamId));
  const p = presentationOf(event);
  const premise = c.bp.story.premise.replace(/\s+/g, " ").trim();
  const firstSentence = /^[^.!?]{12,140}[.!?]?/.exec(premise)?.[0] ?? "";
  const dress = c.bp.evidence.map((e) => Boolean(state.evidence[e.id]));
  return {
    eventId: event.id,
    eventName: event.name,
    teamName,
    caseNumber: deriveCaseNumber(c.bp.event.id, p.cinematic.caseNumber),
    title: c.bp.story.title || event.name,
    kicker: p.cinematic.kicker || firstSentence,
    codename: c.bp.story.codename || c.bp.event.codename,
    extraLines: p.cinematic.lines,
    world: u.fingerprint,
    counts: { ...u.counts, acts: c.bp.acts.length },
    evidence: dress,
    intensity: p.intensity,
  };
}

/* ─────────────────────────── The front door ─────────────────────────── */

export interface TeaserView {
  input: UniverseInput;
  fingerprint: string;
  layoutSeed: string;
  counts: { files: number; acts: number; exhibits: number };
}

/**
 * A public, spoiler-free picture of the case for the landing and sign-in pages.
 * It carries the *shape* an attendee can already infer from the event page — how
 * many files, in how many acts, of which kinds — and nothing else: no titles, no
 * points, no timings, no gates. Every file is a classified silhouette.
 */
export function teaserUniverse(event: EventRow): TeaserView | null {
  const c = compiledFor(event);
  if (!c) return null;
  const actIndex = new Map(c.bp.acts.map((a, i) => [a.id, i]));
  const roundIndex = new Map(c.bp.rounds.map((r, i) => [r.id, i]));
  const perRound = new Map<string, string[]>();
  for (const n of c.bp.nodes) perRound.set(n.round, [...(perRound.get(n.round) ?? []), n.id]);
  const nodes: UNodeIn[] = c.bp.nodes.map((n) => {
    const round = c.bp.rounds.find((r) => r.id === n.round)!;
    return {
      id: n.id,
      title: null,
      // Locked with a little progress reads as "in sight": present and legible as a shape, never as content.
      state: "locked",
      family: round.family,
      actIndex: actIndex.get(round.act) ?? 0,
      roundIndex: roundIndex.get(round.id) ?? 0,
      indexInRound: perRound.get(n.round)!.indexOf(n.id),
      roundSize: perRound.get(n.round)!.length,
      points: 0,
      minutes: 0,
      optional: false,
      isNew: false,
      opensAt: null,
      progress: 0.55,
      signals: { discoveries: 0, contradictions: 0, wrong: 0, hints: 0 },
    };
  });
  const acts: UActIn[] = c.bp.acts.map((a) => ({ id: a.id, title: null, started: false, complete: false }));
  return {
    input: { nodes, edges: [], acts },
    fingerprint: hex16(`pres:front:${event.id}`),
    layoutSeed: `${event.id}:${c.version}`,
    counts: { files: nodes.length, acts: acts.length, exhibits: c.bp.evidence.length },
  };
}

/* ─────────────────────────── The arena (projector) ─────────────────────────── */

export interface ArenaView extends TeaserView {
  solved: number;
  teams: number;
}

/**
 * The case opening up as teams solve it, for a public screen. Like a CTF scoreboard's solve counts, and
 * nothing more: a file is lit once any team has solved it, brighter the more have; no titles, no team
 * positions (where a team is working is a competitive secret), no gates.
 */
export async function arenaUniverse(db: Executor, event: EventRow): Promise<ArenaView | null> {
  const base = teaserUniverse(event);
  const c = compiledFor(event);
  if (!base || !c) return null;
  const rows = await db
    .select({ state: gameStates.state })
    .from(gameStates)
    .innerJoin(teams, eq(teams.id, gameStates.teamId))
    .where(and(eq(teams.eventId, event.id), ne(teams.kind, "playtest"), ne(teams.status, "disqualified")));
  const solvedBy = new Map<string, number>();
  for (const r of rows) for (const [id, ns] of Object.entries((r.state as unknown as GameState).nodes)) if (ns.status === "solved") solvedBy.set(id, (solvedBy.get(id) ?? 0) + 1);
  const nodes: UNodeIn[] = base.input.nodes.map((n) => {
    const k = solvedBy.get(n.id) ?? 0;
    return { ...n, state: k > 0 ? "solved" : "locked", progress: k > 0 ? 1 : 0.4, meta: { solvedBy: k } };
  });
  const acts: UActIn[] = base.input.acts.map((a, i) => ({ ...a, started: nodes.some((n) => n.actIndex === i && n.state === "solved") }));
  return { ...base, input: { nodes, edges: [], acts }, solved: nodes.filter((n) => n.state === "solved").length, teams: rows.length };
}
