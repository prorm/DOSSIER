/**
 * Game state is a pure fold over the append-only state journal
 * (`game_state_events`). Nothing mutates GameState directly: commands produce
 * journal events, and `reduce` is the only function that interprets them.
 */

export type FlagValue = boolean | number | string;
export type ResourceKind = "points" | "intel" | "hints" | "tokens";

export type StateEventBody =
  | { type: "node.unlocked"; node: string; round?: string; reason: string }
  | { type: "node.step"; node: string; key: string; value: unknown }
  | { type: "node.solved"; node: string; points: number }
  | { type: "node.failed"; node: string; reason: string }
  | { type: "evidence.gained"; id: string; source: string }
  | { type: "flag.set"; key: string; value: FlagValue }
  | { type: "resource.delta"; resource: ResourceKind; delta: number; reason: string }
  | { type: "hint.taken"; node: string; index: number; level: string; cost: number; currency: "points" | "tokens" }
  | { type: "discovery"; node: string; key: string; label: string }
  | { type: "interview.asked"; node: string; suspect: string; question: string }
  | { type: "interview.confronted"; node: string; suspect: string; evidence: string; hit: boolean }
  | { type: "contradiction"; node: string; suspect: string; id: string; label: string }
  | { type: "location.visited"; id: string }
  | { type: "timeline.learned"; id: string }
  | { type: "checkpoint.confirmed"; id: string }
  | { type: "phase.set"; phase: string }
  | { type: "board.evaluated"; node?: string; valid: number; invalid: number }
  | { type: "artifact.obtained"; node: string; name: string }
  | { type: "final.submitted"; node: string; attempt: number; credit: number; correct: string[]; total: number; solved: boolean }
  | { type: "partial.awarded"; node: string; points: number; reason: string };

export type StateEventType = StateEventBody["type"];

/** A journal row: the body plus its sequence number (`seq`, the game_state_events id) and timestamp. */
export type StateEvent = StateEventBody & { seq: number; at: string };

export interface NodeState {
  status: "unlocked" | "solved" | "failed";
  unlockedAt: string;
  solvedAt?: string;
  points?: number;
  /** Primitive-specific progress (cryptic steps, interview flags, best partial credit…). */
  steps: Record<string, unknown>;
  hints: number[];
}

export interface SuspectState {
  asked: string[];
  confronted: string[];
  contradictions: string[];
}

export interface GameState {
  eventId: string;
  teamId: string;
  /** Id of the last journal event folded in. */
  version: number;
  narrativePhase: string;
  flags: Record<string, FlagValue>;
  evidence: Record<string, { at: string; source: string }>;
  inventory: { node: string; name: string; at: string }[];
  suspects: Record<string, SuspectState>;
  locations: Record<string, { at: string }>;
  timeline: Record<string, { at: string }>;
  nodes: Record<string, NodeState>;
  rounds: Record<string, { at: string }>;
  checkpoints: Record<string, { at: string }>;
  discoveries: Record<string, string[]>;
  contradictions: Record<string, { suspect: string; label: string; at: string }>;
  board: { valid: number; invalid: number; at: string | null };
  resources: Record<ResourceKind, number>;
  final: { attempts: number; bestCredit: number; solved: boolean };
}

export function emptyState(eventId: string, teamId: string, opts: { phase?: string; hintTokens?: number } = {}): GameState {
  return {
    eventId,
    teamId,
    version: 0,
    narrativePhase: opts.phase ?? "briefing",
    flags: {},
    evidence: {},
    inventory: [],
    suspects: {},
    locations: {},
    timeline: {},
    nodes: {},
    rounds: {},
    checkpoints: {},
    discoveries: {},
    contradictions: {},
    board: { valid: 0, invalid: 0, at: null },
    resources: { points: 0, intel: 0, hints: opts.hintTokens ?? 0, tokens: 0 },
    final: { attempts: 0, bestCredit: 0, solved: false },
  };
}

function suspect(s: GameState, id: string): SuspectState {
  return (s.suspects[id] ??= { asked: [], confronted: [], contradictions: [] });
}

/** Applies one journal event to a fresh copy of the state. */
export function reduce(prev: GameState, ev: StateEvent): GameState {
  const s: GameState = structuredClone(prev);
  mutate(s, ev);
  return s;
}

function mutate(s: GameState, ev: StateEvent): void {
  s.version = Math.max(s.version, ev.seq);
  switch (ev.type) {
    case "node.unlocked":
      if (!s.nodes[ev.node]) s.nodes[ev.node] = { status: "unlocked", unlockedAt: ev.at, steps: {}, hints: [] };
      if (ev.round && !s.rounds[ev.round]) s.rounds[ev.round] = { at: ev.at };
      break;
    case "node.step": {
      const n = (s.nodes[ev.node] ??= { status: "unlocked", unlockedAt: ev.at, steps: {}, hints: [] });
      n.steps[ev.key] = ev.value;
      break;
    }
    case "node.solved": {
      const n = (s.nodes[ev.node] ??= { status: "unlocked", unlockedAt: ev.at, steps: {}, hints: [] });
      if (n.status !== "solved") {
        n.status = "solved";
        n.solvedAt = ev.at;
        n.points = ev.points;
        s.resources.points += ev.points;
      }
      break;
    }
    case "node.failed": {
      const n = s.nodes[ev.node];
      if (n && n.status === "unlocked") n.status = "failed";
      break;
    }
    case "evidence.gained":
      if (!s.evidence[ev.id]) s.evidence[ev.id] = { at: ev.at, source: ev.source };
      break;
    case "flag.set":
      s.flags[ev.key] = ev.value;
      break;
    case "resource.delta":
      s.resources[ev.resource] = (s.resources[ev.resource] ?? 0) + ev.delta;
      break;
    case "hint.taken": {
      const n = s.nodes[ev.node];
      if (n && !n.hints.includes(ev.index)) n.hints.push(ev.index);
      if (ev.currency === "tokens") s.resources.hints -= ev.cost;
      else s.resources.points -= ev.cost;
      break;
    }
    case "discovery": {
      const list = (s.discoveries[ev.node] ??= []);
      if (!list.includes(ev.key)) list.push(ev.key);
      break;
    }
    case "interview.asked": {
      const x = suspect(s, ev.suspect);
      if (!x.asked.includes(ev.question)) x.asked.push(ev.question);
      break;
    }
    case "interview.confronted": {
      const x = suspect(s, ev.suspect);
      if (!x.confronted.includes(ev.evidence)) x.confronted.push(ev.evidence);
      break;
    }
    case "contradiction": {
      const x = suspect(s, ev.suspect);
      if (!x.contradictions.includes(ev.id)) x.contradictions.push(ev.id);
      if (!s.contradictions[ev.id]) s.contradictions[ev.id] = { suspect: ev.suspect, label: ev.label, at: ev.at };
      break;
    }
    case "location.visited":
      if (!s.locations[ev.id]) s.locations[ev.id] = { at: ev.at };
      break;
    case "timeline.learned":
      if (!s.timeline[ev.id]) s.timeline[ev.id] = { at: ev.at };
      break;
    case "checkpoint.confirmed":
      if (!s.checkpoints[ev.id]) s.checkpoints[ev.id] = { at: ev.at };
      break;
    case "phase.set":
      s.narrativePhase = ev.phase;
      break;
    case "board.evaluated":
      s.board = { valid: ev.valid, invalid: ev.invalid, at: ev.at };
      break;
    case "artifact.obtained":
      if (!s.inventory.some((i) => i.node === ev.node && i.name === ev.name)) s.inventory.push({ node: ev.node, name: ev.name, at: ev.at });
      break;
    case "final.submitted":
      s.final.attempts = Math.max(s.final.attempts, ev.attempt);
      s.final.bestCredit = Math.max(s.final.bestCredit, ev.credit);
      if (ev.solved) s.final.solved = true;
      break;
    case "partial.awarded":
      s.resources.points += ev.points;
      break;
  }
}

export function reduceAll(initial: GameState, events: StateEvent[]): GameState {
  const s = structuredClone(initial);
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) mutate(s, e);
  return s;
}

/* ─── Convenience projections matching the conceptual GameState shape ─── */

export const unlockedChallenges = (s: GameState) => Object.keys(s.nodes);
export const solvedChallenges = (s: GameState) => Object.entries(s.nodes).filter(([, n]) => n.status === "solved").map(([id]) => id);
export const unlockedRounds = (s: GameState) => Object.keys(s.rounds);
export const heldEvidence = (s: GameState) => Object.keys(s.evidence);
export const isSolved = (s: GameState, node: string) => s.nodes[node]?.status === "solved";

/** Human-readable one-liners for the "what changed" feed. `names` resolves ids to titles. */
export function describeEvent(ev: StateEventBody, names: (kind: "node" | "evidence" | "checkpoint" | "character" | "location" | "timeline", id: string) => string): string | null {
  switch (ev.type) {
    case "node.unlocked":
      return `Unlocked: ${names("node", ev.node)}`;
    case "node.solved":
      return `Solved: ${names("node", ev.node)}${ev.points ? ` (+${ev.points})` : ""}`;
    case "node.failed":
      return `Locked out: ${names("node", ev.node)}`;
    case "evidence.gained":
      return `New evidence: ${names("evidence", ev.id)}`;
    case "discovery":
      return `Discovery — ${ev.label}`;
    case "contradiction":
      return `Contradiction recorded: ${ev.label}`;
    case "checkpoint.confirmed":
      return `Checkpoint confirmed: ${names("checkpoint", ev.id)}`;
    case "hint.taken":
      return `Hint used on ${names("node", ev.node)} (−${ev.cost} ${ev.currency})`;
    case "phase.set":
      return `Narrative phase → ${ev.phase}`;
    case "board.evaluated":
      // Automatic re-analysis on every save stays silent (it would be a guessing oracle); explicit submissions are reported.
      return ev.node ? `Theory submitted: ${ev.valid} supported link${ev.valid === 1 ? "" : "s"}${ev.invalid ? `, ${ev.invalid} unsupported` : ""}` : null;
    case "artifact.obtained":
      return `Acquired artifact ${ev.name}`;
    case "final.submitted":
      return `Final reconstruction filed (${ev.correct.length}/${ev.total} findings held up)`;
    case "partial.awarded":
      return `Partial credit: +${ev.points} (${ev.reason})`;
    case "resource.delta":
      return ev.delta > 0 ? `+${ev.delta} ${ev.resource} (${ev.reason})` : `${ev.delta} ${ev.resource} (${ev.reason})`;
    case "timeline.learned":
      return `Timeline entry recovered: ${names("timeline", ev.id)}`;
    case "location.visited":
      return `Location logged: ${names("location", ev.id)}`;
    default:
      return null;
  }
}
