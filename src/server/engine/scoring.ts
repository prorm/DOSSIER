import { modeFor } from "./modes";
import type { ChallengeRow } from "./types";

export interface LogEntry {
  id: number;
  teamId: string;
  type: "solve" | "hint" | "checkpoint" | "accusation" | "adjustment";
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
  breakdown: { hunt: number; ctf: number; inquest: number; live: number; hints: number; adjustments: number };
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

/**
 * Derives scores purely from the append-only event log.
 *
 *  - Solves are valued at the challenge's *current* value (dynamic decay applies
 *    retroactively), plus the first-blood bonus for the first non-disqualified solver.
 *  - All other entries carry a fixed point delta.
 *  - Ranking: score desc → earliest time the score was reached → shared rank.
 *  - Disqualified teams are listed last, unranked, and do not affect solve counts.
 *  - `until` computes the frozen view (entries after the freeze are ignored).
 */
export function computeScores(teams: TeamInfo[], log: LogEntry[], challengeById: Map<string, ChallengeRow>, until?: Date | null): ScoreComputation {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const entries = log
    .filter((e) => teamById.has(e.teamId) && (!until || e.createdAt <= until))
    .sort((a, b) => a.id - b.id);

  const eligible = (teamId: string) => teamById.get(teamId)?.status !== "disqualified";

  // Solve order per challenge (eligible teams only).
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
      breakdown: { hunt: 0, ctf: 0, inquest: 0, live: 0, hints: 0, adjustments: 0 },
    });
  }
  const series: Record<string, SeriesPoint[]> = {};

  for (const e of entries) {
    const s = acc.get(e.teamId)!;
    let delta = 0;
    if (e.type === "solve") {
      const c = e.challengeId ? challengeById.get(e.challengeId) : undefined;
      if (!c) continue; // challenge removed from the pack: solve no longer counts
      const order = solveOrder.get(c.id) ?? [];
      const idx = order.indexOf(e.teamId);
      delta = modeFor(c).pointsForSolve(c, idx < 0 ? order.length : idx, order.length);
      s.solves += 1;
      s.breakdown[c.mode] += delta;
    } else {
      delta = e.points ?? 0;
      if (e.type === "hint") s.breakdown.hints += delta;
      else if (e.type === "checkpoint") s.breakdown.live += delta;
      else if (e.type === "accusation") s.breakdown.inquest += delta;
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
