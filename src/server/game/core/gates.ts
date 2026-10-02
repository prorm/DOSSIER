import { z } from "zod";
import type { GameState } from "./state";

/**
 * Gate expressions — the edges of the challenge graph. A node (or an evidence
 * item) becomes available when its gate evaluates true against the team's
 * GameState. Gates are data, fully introspectable, and never executed as code.
 */
export type Gate =
  | { always: true }
  | { node: string }
  | { all: Gate[] }
  | { any: Gate[] }
  | { atLeast: number; of: Gate[] }
  | { evidence: string }
  | { flag: string; eq?: string | number | boolean; gte?: number }
  | { score: number }
  | { resource: "intel" | "tokens" | "hints"; gte: number }
  | { checkpoint: string }
  | { after: string }
  | { before: string }
  | { phase: string }
  | { links: number }
  | { discovery: string; node: string }
  | { hidden: Gate };

const Id = z.string().min(1).max(80);

export const GateSchema: z.ZodType<Gate> = z.lazy(() =>
  z.union([
    z.object({ always: z.literal(true) }).strict(),
    z.object({ node: Id }).strict(),
    z.object({ all: z.array(GateSchema).min(1).max(40) }).strict(),
    z.object({ any: z.array(GateSchema).min(1).max(40) }).strict(),
    z.object({ atLeast: z.number().int().min(1).max(40), of: z.array(GateSchema).min(1).max(40) }).strict(),
    z.object({ evidence: Id }).strict(),
    z.object({ flag: Id, eq: z.union([z.string(), z.number(), z.boolean()]).optional(), gte: z.number().optional() }).strict(),
    z.object({ score: z.number().int() }).strict(),
    z.object({ resource: z.enum(["intel", "tokens", "hints"]), gte: z.number().int() }).strict(),
    z.object({ checkpoint: Id }).strict(),
    z.object({ after: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "after must be an ISO timestamp") }).strict(),
    z.object({ before: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "before must be an ISO timestamp") }).strict(),
    z.object({ phase: Id }).strict(),
    z.object({ links: z.number().int().min(1).max(200) }).strict(),
    z.object({ discovery: Id, node: Id }).strict(),
    z.object({ hidden: GateSchema }).strict(),
  ]),
);

export interface GateEnv {
  now: Date;
}

export function evaluateGate(g: Gate | undefined, s: GameState, env: GateEnv): boolean {
  if (!g) return true;
  if ("always" in g) return true;
  if ("node" in g && !("discovery" in g)) return s.nodes[g.node]?.status === "solved";
  if ("all" in g) return g.all.every((x) => evaluateGate(x, s, env));
  if ("any" in g) return g.any.some((x) => evaluateGate(x, s, env));
  if ("atLeast" in g) return g.of.filter((x) => evaluateGate(x, s, env)).length >= g.atLeast;
  if ("evidence" in g) return Boolean(s.evidence[g.evidence]);
  if ("flag" in g) {
    const v = s.flags[g.flag];
    if (v === undefined) return false;
    if (g.eq !== undefined) return v === g.eq;
    if (g.gte !== undefined) return typeof v === "number" && v >= g.gte;
    return Boolean(v);
  }
  if ("score" in g) return s.resources.points >= g.score;
  if ("resource" in g) return (s.resources[g.resource] ?? 0) >= g.gte;
  if ("checkpoint" in g) return Boolean(s.checkpoints[g.checkpoint]);
  if ("after" in g) return env.now.getTime() >= Date.parse(g.after);
  if ("before" in g) return env.now.getTime() < Date.parse(g.before);
  if ("phase" in g) return s.narrativePhase === g.phase;
  if ("links" in g) return s.board.valid >= g.links;
  if ("discovery" in g) return (s.discoveries[g.node] ?? []).includes(g.discovery);
  if ("hidden" in g) return evaluateGate(g.hidden, s, env);
  return false;
}

/** Earliest instant at which a purely time-based gate could open (for "scheduled" state). */
export function opensAt(g: Gate | undefined): string | null {
  if (!g) return null;
  if ("after" in g) return new Date(g.after).toISOString();
  if ("all" in g) {
    const times = g.all.map(opensAt).filter((x): x is string => Boolean(x));
    return times.length ? times.sort().at(-1)! : null;
  }
  if ("hidden" in g) return opensAt(g.hidden);
  return null;
}

export interface GateRefs {
  nodes: Set<string>;
  evidence: Set<string>;
  checkpoints: Set<string>;
  flags: Set<string>;
  phases: Set<string>;
  discoveries: Set<string>;
  timeGates: number;
  scoreGates: number;
  linkGates: number;
}

export function gateRefs(g: Gate | undefined, acc?: GateRefs): GateRefs {
  const r: GateRefs = acc ?? {
    nodes: new Set(),
    evidence: new Set(),
    checkpoints: new Set(),
    flags: new Set(),
    phases: new Set(),
    discoveries: new Set(),
    timeGates: 0,
    scoreGates: 0,
    linkGates: 0,
  };
  if (!g) return r;
  if ("discovery" in g) {
    r.discoveries.add(`${g.node}:${g.discovery}`);
    r.nodes.add(g.node);
  } else if ("node" in g) r.nodes.add(g.node);
  else if ("all" in g) g.all.forEach((x) => gateRefs(x, r));
  else if ("any" in g) g.any.forEach((x) => gateRefs(x, r));
  else if ("atLeast" in g) g.of.forEach((x) => gateRefs(x, r));
  else if ("evidence" in g) r.evidence.add(g.evidence);
  else if ("flag" in g) r.flags.add(g.flag);
  else if ("checkpoint" in g) r.checkpoints.add(g.checkpoint);
  else if ("phase" in g) r.phases.add(g.phase);
  else if ("after" in g || "before" in g) r.timeGates += 1;
  else if ("score" in g || "resource" in g) r.scoreGates += 1;
  else if ("links" in g) r.linkGates += 1;
  else if ("hidden" in g) gateRefs(g.hidden, r);
  return r;
}

/** Node ids that are *hard* prerequisites (appear only under all/hidden chains, never inside any/atLeast). */
export function hardNodeDeps(g: Gate | undefined, out = new Set<string>()): Set<string> {
  if (!g) return out;
  if ("node" in g && !("discovery" in g)) out.add(g.node);
  else if ("all" in g) g.all.forEach((x) => hardNodeDeps(x, out));
  else if ("hidden" in g) hardNodeDeps(g.hidden, out);
  return out;
}

export interface GateLine {
  ok: boolean;
  text: string;
  depth: number;
}

/**
 * Player-facing explanation of a gate. Hidden sub-gates are summarised as a
 * single "something else" line so hidden dependencies stay hidden.
 */
export function explainGate(
  g: Gate | undefined,
  s: GameState,
  env: GateEnv,
  name: (kind: "node" | "evidence" | "checkpoint", id: string) => string | null,
  depth = 0,
): GateLine[] {
  if (!g || "always" in g) return [];
  const ok = evaluateGate(g, s, env);
  const line = (text: string): GateLine[] => [{ ok, text, depth }];
  if ("hidden" in g) return line(ok ? "An undisclosed condition is met" : "An undisclosed condition (keep investigating)");
  if ("discovery" in g) return line(`Make a specific discovery in ${name("node", g.node) ?? "a classified file"}`);
  if ("node" in g) return line(`Solve ${name("node", g.node) ?? "a classified file"}`);
  if ("all" in g) return g.all.flatMap((x) => explainGate(x, s, env, name, depth));
  if ("any" in g) return [{ ok, text: "Any one of:", depth }, ...g.any.flatMap((x) => explainGate(x, s, env, name, depth + 1))];
  if ("atLeast" in g) return [{ ok, text: `At least ${g.atLeast} of:`, depth }, ...g.of.flatMap((x) => explainGate(x, s, env, name, depth + 1))];
  if ("evidence" in g) return line(`Obtain evidence: ${name("evidence", g.evidence) ?? "an undisclosed exhibit"}`);
  if ("flag" in g) return line("Reach a specific point in the investigation");
  if ("score" in g) return line(`Reach ${g.score} points`);
  if ("resource" in g) return line(`Hold at least ${g.gte} ${g.resource}`);
  if ("checkpoint" in g) return line(`Confirm field checkpoint: ${name("checkpoint", g.checkpoint) ?? "a physical location"}`);
  if ("after" in g) return line(`Opens at ${new Date(g.after).toISOString()}`);
  if ("before" in g) return line(`Closes at ${new Date(g.before).toISOString()}`);
  if ("phase" in g) return line("Advance the narrative");
  if ("links" in g) return line(`Establish ${g.links} supported links on the evidence board`);
  return [];
}

/** Convenience constructors used by the planner and the v1 adapter. */
export const G = {
  node: (id: string): Gate => ({ node: id }),
  all: (...gs: (Gate | undefined)[]): Gate | undefined => {
    const list = gs.filter((x): x is Gate => Boolean(x));
    return list.length === 0 ? undefined : list.length === 1 ? list[0] : { all: list };
  },
  any: (...gs: Gate[]): Gate => (gs.length === 1 ? gs[0]! : { any: gs }),
};
