/**
 * The organiser's view of the case universe.
 *
 * Studio shows the *real* challenge graph it just compiled, in the same spatial
 * language players will explore: acts are layers, rounds are columns, files are
 * crystals. Nothing here is decorative data. Every node is a file in the draft
 * blueprint and every thread is an edge the analyser found in it.
 *
 * Files are ordered by dependency depth (then story order) so that revealing
 * "the first N" replays the order in which the graph can actually be solved:
 * entry points first, the finale last.
 */

import type { UActIn, UEdgeIn, UniverseInput } from "./universe";

export interface AuthorNode {
  id: string;
  title: string;
  family: string;
  round: string;
  depth: number;
  points: number;
  minutes: number;
  optional: boolean;
  redHerring: boolean;
  perTeam: boolean;
  configError: string | null;
}

export interface AuthorEdge {
  from: string;
  to: string;
  kind: UEdgeIn["kind"];
}

export interface AuthorInput {
  nodes: AuthorNode[];
  edges: AuthorEdge[];
  rounds: { id: string; act: string }[];
  acts: { id: string; title: string }[];
}

export interface AuthorUniverse {
  input: UniverseInput;
  /** Node ids in build order (shallowest first). `input.nodes` is in this order. */
  order: string[];
  /** For each node id, the number of files that must exist before it can (its build position). */
  position: Map<string, number>;
  /** Depth band boundaries: band[i] = the reveal count at which depth i+1 is complete. */
  bands: { depth: number; upTo: number }[];
}

export function authorUniverse(i: AuthorInput): AuthorUniverse {
  const actIndex = new Map(i.acts.map((a, k) => [a.id, k]));
  const roundIndex = new Map(i.rounds.map((r, k) => [r.id, k]));
  const roundAct = new Map(i.rounds.map((r) => [r.id, r.act]));

  // Natural (story) position inside each round, fixed before any re-ordering.
  const perRound = new Map<string, string[]>();
  for (const n of i.nodes) perRound.set(n.round, [...(perRound.get(n.round) ?? []), n.id]);

  const built = [...i.nodes].sort((a, b) => a.depth - b.depth || (roundIndex.get(a.round) ?? 0) - (roundIndex.get(b.round) ?? 0) || perRound.get(a.round)!.indexOf(a.id) - perRound.get(b.round)!.indexOf(b.id));

  const nodes = built.map((n) => {
    const siblings = perRound.get(n.round)!;
    return {
      id: n.id,
      title: n.title,
      // Everything is "open" to an author: they see the whole machine lit. Colour and pulse carry meaning instead.
      state: "open" as const,
      family: n.family,
      actIndex: actIndex.get(roundAct.get(n.round) ?? "") ?? 0,
      roundIndex: roundIndex.get(n.round) ?? 0,
      indexInRound: siblings.indexOf(n.id),
      roundSize: siblings.length,
      points: n.points,
      minutes: n.minutes,
      optional: n.optional,
      isNew: false,
      opensAt: null,
      progress: 1,
      // A red herring or a broken config reads as an anomaly in the universe, exactly as it would to a player.
      signals: { discoveries: n.redHerring ? 1 : 0, contradictions: 0, wrong: n.configError ? 3 : 0, hints: 0 },
      meta: { depth: n.depth, perTeam: n.perTeam, redHerring: n.redHerring, broken: Boolean(n.configError) },
    };
  });

  const known = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: UEdgeIn[] = [];
  for (const e of i.edges) {
    const key = `${e.from}>${e.to}`;
    if (!known.has(e.from) || !known.has(e.to) || e.from === e.to || seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: e.from, to: e.to, kind: e.kind });
  }

  const acts: UActIn[] = i.acts.map((a) => ({ id: a.id, title: a.title, started: true, complete: false }));

  const order = nodes.map((n) => n.id);
  const bands: AuthorUniverse["bands"] = [];
  built.forEach((n, k) => {
    const last = bands[bands.length - 1];
    if (last && last.depth === n.depth) last.upTo = k + 1;
    else bands.push({ depth: n.depth, upTo: k + 1 });
  });

  return { input: { nodes, edges, acts }, order, position: new Map(order.map((id, k) => [id, k])), bands };
}

/**
 * The same draft, as a team will first see it when the doors open: the entry files (nothing gates
 * them) are open and new, the files one step behind them are in sight, everything deeper is still
 * classified — no title, no points. Used to preview a theme on the organiser's own case; nothing here
 * is a game state, it is what the graph's shape implies for a fresh team.
 */
export function doorsOpen(au: AuthorUniverse): UniverseInput {
  const depthOf = (n: UniverseInput["nodes"][number]) => Number(n.meta?.depth ?? 0);
  const minDepth = Math.min(...au.input.nodes.map(depthOf));
  const nodes = au.input.nodes.map((n) => {
    const d = depthOf(n) - minDepth;
    const open = d === 0;
    return { ...n, title: d <= 1 ? n.title : null, state: open ? ("open" as const) : ("locked" as const), isNew: open, progress: d === 1 ? 0.5 : 0, signals: { discoveries: 0, contradictions: 0, wrong: 0, hints: 0 }, meta: {} };
  });
  const startedActs = new Set(nodes.filter((n) => n.state === "open").map((n) => n.actIndex));
  return { nodes, edges: au.input.edges, acts: au.input.acts.map((a, i) => ({ ...a, title: startedActs.has(i) ? a.title : null, started: startedActs.has(i) })) };
}
