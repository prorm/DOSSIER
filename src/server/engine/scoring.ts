import type { ChallengeRow } from "./types";

export interface LogEntry {
  id: number;
  teamId: string;
  type: "solve" | "hint" | "checkpoint" | "accusation" | "adjustment" | "partial";
  challengeId: string | null;
  points: number | null;
  createdAt: Date;
}

export interface TeamInfo {
  id: string;
  name: string;
  status: "active" | "disqualified";
  affiliation?: string | null;
}

export interface Standing {
  rank: number;
  teamId: string;
  name: string;
  affiliation: string | null;
  score: number;
  solves: number;
  /** Time the team reached its current score (tie-breaker: earlier wins). */
  lastScoreAt: string | null;
  disqualified: boolean;
  breakdown: { families: Record<string, number>; partial: number; checkpoints: number; hints: number; adjustments: number };
}

export interface SeriesPoint {
  t: string;
  score: number;
}

export interface ScoreComputation {
  standings: Standing[];
  series: Record<string, SeriesPoint[]>;
  solveCounts: Record<string, number>;
  firstBlood: Record<string, string>;
}

export interface NodeScoring {
  family: string;
  points: number;
  firstBloodBonus: number;
  dynamic?: { minimum: number; decay: number };
}

/** Scoring config of a materialised challenge row. */
export function nodeScoring(c: ChallengeRow): NodeScoring {
  const cfg = c.config as { scoring?: { points?: number; firstBloodBonus?: number; dynamic?: { minimum: number; decay: number } } };
  return { family: c.mode, points: cfg.scoring?.points ?? 100, firstBloodBonus: cfg.scoring?.firstBloodBonus ?? 0, dynamic: cfg.scoring?.dynamic };
}

/**
 * Dynamic value: quadratic decay from `initial` to `minimum` over `decay` solves
 * (CTFd-style). Every solver receives the *current* value, so early solvers'
 * points also decay — first blood is rewarded via a separate bonus instead.
 */
export function dynamicValue(initial: number, minimum: number, decay: number, solves: number): number {
  const n = Math.max(0, solves - 1);
  const v = initial + (minimum - initial) * Math.min(1, (n / decay) ** 2);
  return Math.max(minimum, Math.ceil(v));
}

/** Current value of a node for the next solver. */
export function currentValue(s: NodeScoring, totalSolves: number): number {
  return s.dynamic ? dynamicValue(s.points, s.dynamic.minimum, s.dynamic.decay, totalSolves + 1) : s.points;
}

export function pointsForSolve(s: NodeScoring, solveIndex: number, totalSolves: number): number {
  const base = s.dynamic ? dynamicValue(s.points, s.dynamic.minimum, s.dynamic.decay, totalSolves) : s.points;
  return base + (solveIndex === 0 ? s.firstBloodBonus : 0);
}

/**
 * Derives scores purely from the append-only ledger (event_log).
 *
 *  - Solves with a fixed `points` value count that value; solves with null
 *    points are valued at the node's *current* value (dynamic decay applies
 *    retroactively), plus the first-blood bonus for the first eligible solver.
 *  - All other entries carry a fixed point delta.
 *  - Ranking: score desc → earliest time the score was reached → shared rank.
 *  - Disqualified teams are listed last, unranked, and do not affect solve counts.
 *  - `until` computes the frozen view (entries after the freeze are ignored).
 */
export function computeScores(teams: TeamInfo[], log: LogEntry[], nodes: Map<string, NodeScoring>, until?: Date | null): ScoreComputation {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const entries = log.filter((e) => teamById.has(e.teamId) && (!until || e.createdAt <= until)).sort((a, b) => a.id - b.id);
  const eligible = (teamId: string) => teamById.get(teamId)?.status !== "disqualified";

  const solveOrder = new Map<string, string[]>();
  for (const e of entries) {
    if (e.type !== "solve" || !e.challengeId || !eligible(e.teamId)) continue;
    const list = solveOrder.get(e.challengeId) ?? [];
    if (!list.includes(e.teamId)) list.push(e.teamId);
    solveOrder.set(e.challengeId, list);
  }

  const acc = new Map<string, Standing>();
  for (const t of teams) {
    acc.set(t.id, {
      rank: 0,
      teamId: t.id,
      name: t.name,
      affiliation: t.affiliation ?? null,
      score: 0,
      solves: 0,
      lastScoreAt: null,
      disqualified: t.status === "disqualified",
      breakdown: { families: {}, partial: 0, checkpoints: 0, hints: 0, adjustments: 0 },
    });
  }
  const series: Record<string, SeriesPoint[]> = {};

  for (const e of entries) {
    const s = acc.get(e.teamId)!;
    let delta = 0;
    if (e.type === "solve") {
      const n = e.challengeId ? nodes.get(e.challengeId) : undefined;
      if (!n) continue; // node removed from the event: the solve no longer counts
      if (e.points !== null) delta = e.points;
      else {
        const order = solveOrder.get(e.challengeId!) ?? [];
        const idx = order.indexOf(e.teamId);
        delta = pointsForSolve(n, idx < 0 ? order.length : idx, order.length);
      }
      s.solves += 1;
      s.breakdown.families[n.family] = (s.breakdown.families[n.family] ?? 0) + delta;
    } else {
      delta = e.points ?? 0;
      if (e.type === "hint") s.breakdown.hints += delta;
      else if (e.type === "checkpoint") s.breakdown.checkpoints += delta;
      else if (e.type === "partial" || e.type === "accusation") s.breakdown.partial += delta;
      else s.breakdown.adjustments += delta;
    }
    if (delta !== 0) {
      s.score += delta;
      s.lastScoreAt = e.createdAt.toISOString();
      (series[e.teamId] ??= []).push({ t: e.createdAt.toISOString(), score: s.score });
    }
  }

  const ranked = [...acc.values()].filter((s) => !s.disqualified);
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = a.lastScoreAt ?? "9999";
    const bt = b.lastScoreAt ?? "9999";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  ranked.forEach((s, i) => {
    const prev = ranked[i - 1];
    s.rank = prev && prev.score === s.score && prev.lastScoreAt === s.lastScoreAt ? prev.rank : i + 1;
  });
  const dq = [...acc.values()].filter((s) => s.disqualified).sort((a, b) => a.name.localeCompare(b.name));

  const solveCounts: Record<string, number> = {};
  const firstBlood: Record<string, string> = {};
  for (const [cid, order] of solveOrder) {
    solveCounts[cid] = order.length;
    if (order[0]) firstBlood[cid] = order[0];
  }
  return { standings: [...ranked, ...dq], series, solveCounts, firstBlood };
}
