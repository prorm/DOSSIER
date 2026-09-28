import type { challenges, events } from "../db/schema";

export type EventRow = typeof events.$inferSelect;
export type ChallengeRow = typeof challenges.$inferSelect;
export type ChallengeMode = "hunt" | "ctf" | "inquest";

/** Typed view of challenges.config (written by the pack importer / challenge editor). */
export interface ChallengeConfig {
  points: number;
  scoring: { type: "static" } | { type: "dynamic"; initial: number; minimum: number; decay: number };
  first_blood_bonus: number;
  hints: { cost: number; text: string }[];
  requires?: { all: string[]; any: string[] };
  available_from?: string;
  assets: string[];
  position?: { x: number; y: number };
  reveals: string[];
  tags: string[];
  difficulty?: "easy" | "medium" | "hard" | "insane";
}

export function challengeConfig(c: ChallengeRow): ChallengeConfig {
  const raw = c.config as Partial<ChallengeConfig>;
  return {
    points: raw.points ?? 100,
    scoring: raw.scoring ?? { type: "static" },
    first_blood_bonus: raw.first_blood_bonus ?? 0,
    hints: raw.hints ?? [],
    requires: raw.requires,
    available_from: raw.available_from,
    assets: raw.assets ?? [],
    position: raw.position,
    reveals: raw.reveals ?? [],
    tags: raw.tags ?? [],
    difficulty: raw.difficulty,
  };
}

/** Per-team progress snapshot used by availability and projection. */
export interface TeamProgress {
  teamId: string;
  solvedAt: Map<string, Date>;
  hints: Set<string>; // `${challengeId}:${index}`
}

/** Event-wide aggregates. */
export interface EventAggregates {
  solveCounts: Map<string, number>;
  firstBlood: Map<string, { teamId: string; teamName: string }>;
}

export type ChallengeState = "locked" | "scheduled" | "open" | "solved";

export interface Availability {
  state: ChallengeState;
  /** For "scheduled": when it opens (ISO). */
  opensAt?: string;
}

export interface EngineContext {
  event: EventRow;
  now: Date;
  challenges: ChallengeRow[];
  byId: Map<string, ChallengeRow>;
}

/**
 * GameMode plugin contract. A mode owns: availability rules, the value of a
 * solve, and side effects of solving. The engine owns persistence, rate
 * limiting, answer checking and the event log — modes never touch those.
 */
export interface GameMode {
  id: ChallengeMode;
  label: string;
  /** Availability for one team. Must be a pure function of its inputs. */
  availability(c: ChallengeRow, ctx: EngineContext, progress: TeamProgress): Availability;
  /** Current value of a solve given its 0-based solve order and the total number of solves. */
  pointsForSolve(c: ChallengeRow, solveIndex: number, totalSolves: number): number;
  /** Current displayed value (what the next solver would earn, before first-blood bonus). */
  currentValue(c: ChallengeRow, totalSolves: number): number;
  /** Consequences of a solve, returned as data; the engine persists them inside the solve transaction. */
  onSolved(c: ChallengeRow, ctx: EngineContext, progressAfter: TeamProgress): { unlocked: string[]; revealedEvidence: string[] };
}
