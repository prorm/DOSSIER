import { challengeConfig, type Availability, type ChallengeRow, type EngineContext, type GameMode, type TeamProgress } from "./types";

/** Dependency check: every `all` solved and, if `any` is non-empty, at least one of them. */
export function dependenciesMet(c: ChallengeRow, progress: TeamProgress): boolean {
  const req = challengeConfig(c).requires;
  if (!req) return true;
  const allOk = req.all.every((id) => progress.solvedAt.has(id));
  const anyOk = req.any.length === 0 || req.any.some((id) => progress.solvedAt.has(id));
  return allOk && anyOk;
}

function baseAvailability(c: ChallengeRow, ctx: EngineContext, progress: TeamProgress): Availability {
  if (progress.solvedAt.has(c.id)) return { state: "solved" };
  if (!dependenciesMet(c, progress)) return { state: "locked" };
  const from = challengeConfig(c).available_from;
  if (from && new Date(from) > ctx.now) return { state: "scheduled", opensAt: from };
  return { state: "open" };
}

/** Challenges that become open for a team as a consequence of solving `solvedId`. */
function newlyUnlocked(solvedId: string, ctx: EngineContext, after: TeamProgress): string[] {
  const out: string[] = [];
  for (const other of ctx.challenges) {
    if (other.hidden || after.solvedAt.has(other.id)) continue;
    const req = challengeConfig(other).requires;
    if (!req) continue;
    if (![...req.all, ...req.any].includes(solvedId)) continue;
    const before: TeamProgress = { ...after, solvedAt: new Map([...after.solvedAt].filter(([k]) => k !== solvedId)) };
    if (dependenciesMet(other, after) && !dependenciesMet(other, before)) out.push(other.id);
  }
  return out;
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

function staticPoints(c: ChallengeRow) {
  return challengeConfig(c).points;
}

export const huntMode: GameMode = {
  id: "hunt",
  label: "Treasure Hunt",
  availability: baseAvailability,
  pointsForSolve: (c) => staticPoints(c),
  currentValue: (c) => staticPoints(c),
  onSolved: (c, ctx, after) => ({ unlocked: newlyUnlocked(c.id, ctx, after), revealedEvidence: [] }),
};

export const ctfMode: GameMode = {
  id: "ctf",
  label: "Capture the Flag",
  availability: baseAvailability,
  pointsForSolve(c, solveIndex, totalSolves) {
    const cfg = challengeConfig(c);
    const base = cfg.scoring.type === "dynamic" ? dynamicValue(cfg.scoring.initial, cfg.scoring.minimum, cfg.scoring.decay, totalSolves) : cfg.points;
    return base + (solveIndex === 0 ? cfg.first_blood_bonus : 0);
  },
  currentValue(c, totalSolves) {
    const cfg = challengeConfig(c);
    return cfg.scoring.type === "dynamic" ? dynamicValue(cfg.scoring.initial, cfg.scoring.minimum, cfg.scoring.decay, totalSolves + 1) : cfg.points;
  },
  onSolved: (c, ctx, after) => ({ unlocked: newlyUnlocked(c.id, ctx, after), revealedEvidence: [] }),
};

export const inquestMode: GameMode = {
  id: "inquest",
  label: "Criminal Inquest",
  availability: baseAvailability,
  pointsForSolve: (c) => staticPoints(c),
  currentValue: (c) => staticPoints(c),
  onSolved: (c, ctx, after) => ({ unlocked: newlyUnlocked(c.id, ctx, after), revealedEvidence: challengeConfig(c).reveals }),
};

export const MODES: Record<ChallengeRow["mode"], GameMode> = { hunt: huntMode, ctf: ctfMode, inquest: inquestMode };

export function modeFor(c: ChallengeRow): GameMode {
  return MODES[c.mode];
}
