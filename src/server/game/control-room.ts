import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { checkpoints, checkpointScans, gameStateEvents, gameStates, submissions, teams } from "../db/schema";
import type { EventRow } from "../engine/types";
import { getLeaderboard } from "../engine/leaderboard";
import { compiledFor } from "./compile";
import { describeEvent, type GameState, type StateEventBody } from "./core/state";

/**
 * Control Room analytics. Everything is derived from the game-state snapshots
 * and the journal, so the numbers match exactly what teams experienced.
 * Playtest teams are excluded.
 */

export interface NodeTelemetry {
  id: string;
  title: string;
  round: string;
  primitive: string;
  optional: boolean;
  critical: boolean;
  expectedMinutes: number;
  unlocked: number;
  solved: number;
  inProgress: number;
  stuck: number;
  attempts: number;
  wrong: number;
  failureRate: number;
  hintRate: number;
  abandonment: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
}

export interface TeamTelemetry {
  teamId: string;
  name: string;
  score: number;
  rank: number;
  completion: number;
  solved: number;
  current: { id: string; title: string; minutes: number } | null;
  lastActivityAt: string | null;
  active: boolean;
  stuck: boolean;
  hints: number;
}

export interface Warning {
  severity: "critical" | "warning" | "info";
  node?: string;
  message: string;
}

/** The shape of the case, for the operations view: where every file sits and which gates lead where. */
export interface OpsGraph {
  nodes: { id: string; title: string; family: string; actIndex: number; roundIndex: number; indexInRound: number; roundSize: number; points: number; minutes: number; optional: boolean; critical: boolean }[];
  edges: { from: string; to: string; kind: "gate" | "checkpoint" }[];
  acts: { id: string; title: string }[];
}

export interface PulseBucket {
  at: string;
  attempts: number;
  correct: number;
}

export interface ControlRoom {
  generatedAt: string;
  startedAt: string | null;
  endsAt: string | null;
  graph: OpsGraph;
  /** The last hour in five-minute buckets, oldest first. */
  pulse: PulseBucket[];
  hintsLastHour: number;
  teams: TeamTelemetry[];
  activeTeams: number;
  totalTeams: number;
  avgCompletion: number;
  nodes: NodeTelemetry[];
  mostFailed: NodeTelemetry[];
  potentiallyBroken: NodeTelemetry[];
  checkpointTraffic: { id: string; name: string; lastHour: number; total: number; pending: number }[];
  warnings: Warning[];
  feed: { at: string; team: string; text: string }[];
  elapsedFraction: number | null;
}

const ACTIVE_MS = 10 * 60_000;

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return Math.round(s[i]! * 10) / 10;
}

export async function controlRoom(db: Executor, event: EventRow, now = new Date()): Promise<ControlRoom | null> {
  const c = compiledFor(event);
  if (!c) return null;
  const nowMs = now.getTime();
  const hourAgo = new Date(nowMs - 60 * 60_000);

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, status: teams.status })
    .from(teams)
    .where(and(eq(teams.eventId, event.id), ne(teams.kind, "playtest")));
  const teamIds = teamRows.map((t) => t.id);
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const BUCKET = 5 * 60_000;
  const BUCKETS = 12;
  const pulseStart = Math.floor(nowMs / BUCKET) * BUCKET - (BUCKETS - 1) * BUCKET;

  const [snapshots, lastActs, subs, lb, cps, scans, recent, recentSubs, hintRows] = await Promise.all([
    teamIds.length ? db.select({ teamId: gameStates.teamId, state: gameStates.state }).from(gameStates).where(inArray(gameStates.teamId, teamIds)) : [],
    teamIds.length
      ? db
          .select({ teamId: gameStateEvents.teamId, last: sql<string>`max(${gameStateEvents.createdAt})` })
          .from(gameStateEvents)
          .where(and(eq(gameStateEvents.eventId, event.id), inArray(gameStateEvents.teamId, teamIds)))
          .groupBy(gameStateEvents.teamId)
      : [],
    teamIds.length
      ? db
          .select({
            node: submissions.challengeId,
            attempts: sql<number>`count(*)::int`,
            wrong: sql<number>`count(*) filter (where not ${submissions.correct})::int`,
          })
          .from(submissions)
          .where(and(eq(submissions.eventId, event.id), inArray(submissions.teamId, teamIds)))
          .groupBy(submissions.challengeId)
      : [],
    getLeaderboard(db, event.id, "live"),
    db.select({ id: checkpoints.id, name: checkpoints.name }).from(checkpoints).where(eq(checkpoints.eventId, event.id)),
    db
      .select({
        id: checkpointScans.checkpointId,
        total: sql<number>`count(*)::int`,
        lastHour: sql<number>`count(*) filter (where ${checkpointScans.createdAt} >= ${hourAgo})::int`,
        pending: sql<number>`count(*) filter (where ${checkpointScans.status} = 'pending')::int`,
      })
      .from(checkpointScans)
      .where(eq(checkpointScans.eventId, event.id))
      .groupBy(checkpointScans.checkpointId),
    teamIds.length
      ? db
          .select()
          .from(gameStateEvents)
          .where(and(eq(gameStateEvents.eventId, event.id), inArray(gameStateEvents.teamId, teamIds), gte(gameStateEvents.createdAt, new Date(nowMs - 6 * 60 * 60_000))))
          .orderBy(desc(gameStateEvents.id))
          .limit(60)
      : [],
    teamIds.length
      ? db
          .select({ at: submissions.createdAt, correct: submissions.correct })
          .from(submissions)
          .where(and(eq(submissions.eventId, event.id), inArray(submissions.teamId, teamIds), gte(submissions.createdAt, new Date(pulseStart))))
          .limit(20_000)
      : [],
    teamIds.length
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(gameStateEvents)
          .where(and(eq(gameStateEvents.eventId, event.id), inArray(gameStateEvents.teamId, teamIds), eq(gameStateEvents.type, "hint.taken"), gte(gameStateEvents.createdAt, hourAgo)))
      : [],
  ]);

  const states = new Map(snapshots.map((s) => [s.teamId, s.state as unknown as GameState]));
  const lastAt = new Map(lastActs.map((r) => [r.teamId, new Date(r.last)]));
  const subsBy = new Map(subs.map((s) => [s.node, s]));
  const standing = new Map(lb.standings.map((s) => [s.teamId, s]));
  const critical = new Set(c.analysis.criticalPath);
  const required = c.bp.nodes.filter((n) => !n.optional);
  const live = event.status === "live";

  // ── per node ──
  const nodes: NodeTelemetry[] = c.bp.nodes.map((n) => {
    const expected = n.estimatedMinutes;
    let unlocked = 0, solved = 0, inProgress = 0, stuck = 0, hinted = 0, abandoned = 0;
    const times: number[] = [];
    for (const id of teamIds) {
      const ns = states.get(id)?.nodes[n.id];
      if (!ns) continue;
      unlocked++;
      if (ns.hints.length) hinted++;
      if (ns.status === "solved" && ns.solvedAt) {
        solved++;
        times.push((Date.parse(ns.solvedAt) - Date.parse(ns.unlockedAt)) / 60_000);
        continue;
      }
      inProgress++;
      const open = (nowMs - Date.parse(ns.unlockedAt)) / 60_000;
      const last = lastAt.get(id)?.getTime() ?? 0;
      const teamActive = nowMs - last < ACTIVE_MS;
      if (live && open > Math.max(15, expected * 1.5)) {
        stuck++;
        // Abandoned: long open, and the team has gone quiet or is only working elsewhere.
        if (open > expected * 2.5 || !teamActive) abandoned++;
      }
    }
    const s = subsBy.get(n.id);
    const attempts = s?.attempts ?? 0;
    const wrong = s?.wrong ?? 0;
    return {
      id: n.id,
      title: n.title,
      round: c.bp.rounds.find((r) => r.id === n.round)?.title ?? n.round,
      primitive: n.primitive,
      optional: n.optional,
      critical: critical.has(n.id),
      expectedMinutes: expected,
      unlocked,
      solved,
      inProgress,
      stuck,
      attempts,
      wrong,
      failureRate: attempts ? wrong / attempts : 0,
      hintRate: unlocked ? hinted / unlocked : 0,
      abandonment: unlocked ? abandoned / unlocked : 0,
      medianMinutes: quantile(times, 0.5),
      p90Minutes: quantile(times, 0.9),
    };
  });

  // ── per team ──
  const teamsOut: TeamTelemetry[] = teamRows.map((t) => {
    const st = states.get(t.id);
    const solvedReq = st ? required.filter((n) => st.nodes[n.id]?.status === "solved").length : 0;
    const open = st
      ? Object.entries(st.nodes)
          .filter(([, v]) => v.status !== "solved")
          .sort((a, b) => (critical.has(b[0]) ? 1 : 0) - (critical.has(a[0]) ? 1 : 0) || Date.parse(a[1].unlockedAt) - Date.parse(b[1].unlockedAt))
      : [];
    const cur = open[0];
    const last = lastAt.get(t.id) ?? null;
    const lastSolve = st ? Math.max(0, ...Object.values(st.nodes).map((v) => (v.solvedAt ? Date.parse(v.solvedAt) : 0))) : 0;
    const since = lastSolve || (event.startedAt?.getTime() ?? nowMs);
    const s = standing.get(t.id);
    return {
      teamId: t.id,
      name: t.name,
      score: s?.score ?? 0,
      rank: s?.rank ?? 0,
      completion: required.length ? solvedReq / required.length : 0,
      solved: st ? Object.values(st.nodes).filter((v) => v.status === "solved").length : 0,
      current: cur ? { id: cur[0], title: c.nodes.get(cur[0])?.title ?? cur[0], minutes: Math.round((nowMs - Date.parse(cur[1].unlockedAt)) / 60_000) } : null,
      lastActivityAt: last?.toISOString() ?? null,
      active: last ? nowMs - last.getTime() < ACTIVE_MS : false,
      stuck: live && t.status === "active" && Boolean(cur) && nowMs - since > 30 * 60_000,
      hints: st ? Object.values(st.nodes).reduce((a, v) => a + v.hints.length, 0) : 0,
    };
  });
  teamsOut.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));

  // ── warnings ──
  const warnings: Warning[] = [];
  const started = event.startedAt?.getTime();
  const ends = event.endsAt?.getTime();
  const elapsedFraction = started && ends && ends > started ? Math.min(1, Math.max(0, (nowMs - started) / (ends - started))) : null;
  for (const n of nodes) {
    if (n.unlocked >= 3 && n.stuck / n.unlocked >= 0.6) warnings.push({ severity: "critical", node: n.id, message: `${n.stuck} of ${n.unlocked} teams stuck on “${n.title}” · open past ${Math.round(n.expectedMinutes * 1.5)} min (est. ${n.expectedMinutes})` });
    if (n.attempts >= 15 && n.solved === 0) warnings.push({ severity: "critical", node: n.id, message: `“${n.title}” may be broken: ${n.attempts} attempts, no solves` });
    else if (n.attempts >= 20 && n.failureRate > 0.95) warnings.push({ severity: "warning", node: n.id, message: `“${n.title}” rejects ${Math.round(n.failureRate * 100)}% of answers — check answer normalisation` });
    if (n.medianMinutes !== null && n.solved >= 3 && n.medianMinutes > n.expectedMinutes * 2.5) warnings.push({ severity: "warning", node: n.id, message: `“${n.title}” median solve ${n.medianMinutes} min vs ${n.expectedMinutes} min expected` });
    if (n.unlocked >= 4 && n.hintRate >= 0.8) warnings.push({ severity: "info", node: n.id, message: `${Math.round(n.hintRate * 100)}% of teams needed a hint on “${n.title}”` });
    if (n.critical && elapsedFraction !== null && elapsedFraction > 0.6 && teamIds.length >= 3 && n.unlocked === 0) warnings.push({ severity: "warning", node: n.id, message: `No team has reached “${n.title}” on the critical path at ${Math.round(elapsedFraction * 100)}% of the event` });
  }
  const pending = scans.reduce((a, s) => a + s.pending, 0);
  if (pending >= 5) warnings.push({ severity: "warning", message: `${pending} checkpoint scans awaiting volunteer confirmation` });
  const order = { critical: 0, warning: 1, info: 2 } as const;
  warnings.sort((a, b) => order[a.severity] - order[b.severity]);

  // ── activity feed ──
  const names = (kind: string, id: string) => {
    if (kind === "node") return c.nodes.get(id)?.title ?? id;
    if (kind === "evidence") return c.evidence.get(id)?.title ?? id;
    if (kind === "character") return c.bp.story.characters.find((x) => x.id === id)?.name ?? id;
    if (kind === "location") return c.bp.story.locations.find((x) => x.id === id)?.name ?? id;
    if (kind === "timeline") return c.bp.story.timeline.find((x) => x.id === id)?.title ?? id;
    return id;
  };
  const feed: ControlRoom["feed"] = [];
  for (const r of recent) {
    const text = describeEvent({ ...r.payload, type: r.type } as StateEventBody, names);
    if (text) feed.push({ at: r.createdAt.toISOString(), team: teamName.get(r.teamId) ?? "?", text });
    if (feed.length >= 30) break;
  }

  const cpName = new Map(cps.map((x) => [x.id, x.name]));
  const scanBy = new Map(scans.map((s) => [s.id, s]));
  const checkpointTraffic = [...new Set([...cps.map((x) => x.id), ...scans.map((s) => s.id)])].map((id) => ({
    id,
    name: cpName.get(id) ?? id,
    lastHour: scanBy.get(id)?.lastHour ?? 0,
    total: scanBy.get(id)?.total ?? 0,
    pending: scanBy.get(id)?.pending ?? 0,
  }));

  // ── the shape of the case, and the last hour's pulse ──
  const actIndexOf = new Map(c.bp.acts.map((a, i) => [a.id, i]));
  const roundIndexOf = new Map(c.bp.rounds.map((r, i) => [r.id, i]));
  const perRound = new Map<string, string[]>();
  for (const n of c.bp.nodes) perRound.set(n.round, [...(perRound.get(n.round) ?? []), n.id]);
  const seenEdge = new Set<string>();
  const graphEdges: OpsGraph["edges"] = [];
  for (const e of c.analysis.edges) {
    if (e.kind !== "gate" && e.kind !== "checkpoint") continue;
    const key = `${e.from}>${e.to}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    graphEdges.push({ from: e.from, to: e.to, kind: e.kind });
  }
  const graph: OpsGraph = {
    nodes: c.bp.nodes.map((n) => {
      const round = c.bp.rounds.find((r) => r.id === n.round);
      return {
        id: n.id,
        title: n.title,
        family: round?.family ?? "custom",
        actIndex: actIndexOf.get(round?.act ?? "") ?? 0,
        roundIndex: roundIndexOf.get(n.round) ?? 0,
        indexInRound: perRound.get(n.round)!.indexOf(n.id),
        roundSize: perRound.get(n.round)!.length,
        points: n.scoring.points,
        minutes: n.estimatedMinutes,
        optional: n.optional,
        critical: critical.has(n.id),
      };
    }),
    edges: graphEdges,
    acts: c.bp.acts.map((a) => ({ id: a.id, title: a.title })),
  };
  const pulse: PulseBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({ at: new Date(pulseStart + i * BUCKET).toISOString(), attempts: 0, correct: 0 }));
  for (const r of recentSubs) {
    const i = Math.floor((r.at.getTime() - pulseStart) / BUCKET);
    const b = pulse[i];
    if (b) {
      b.attempts++;
      if (r.correct) b.correct++;
    }
  }

  return {
    generatedAt: now.toISOString(),
    startedAt: event.startedAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
    graph,
    pulse,
    hintsLastHour: hintRows[0]?.n ?? 0,
    teams: teamsOut,
    activeTeams: teamsOut.filter((t) => t.active).length,
    totalTeams: teamsOut.length,
    avgCompletion: teamsOut.length ? teamsOut.reduce((a, t) => a + t.completion, 0) / teamsOut.length : 0,
    nodes,
    mostFailed: [...nodes].filter((n) => n.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 5),
    potentiallyBroken: nodes.filter((n) => (n.attempts >= 15 && n.solved === 0) || (n.unlocked >= 3 && n.stuck === n.unlocked)),
    checkpointTraffic,
    warnings,
    feed,
    elapsedFraction,
  };
}
