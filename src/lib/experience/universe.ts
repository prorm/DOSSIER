/**
 * The case universe: PRESENTATION STATE for the investigation graph.
 *
 *   GAME STATE (authoritative journal)
 *        ↓  server projection (player-safe: only what the team may know)
 *   UniverseInput   – nodes with real states, revealed edges
 *        ↓  buildUniverse()  – pure, deterministic, unit-tested
 *   UniverseModel   – positions, presentation states, visual energy
 *        ↓
 *   R3F scene / SVG fallback / DOM inspector
 *
 * Nothing here invents game events. It only decides *how* real state is shown.
 */

import { prng } from "./variation";
import type { UniverseLayout } from "./themes";

export type Availability = "open" | "solved" | "failed" | "locked" | "scheduled";

/**
 * How a file reads in space.
 *   locked      distant, dim, partly obscured – you don't know what it is
 *   discovered  comes into focus – you're working toward it (or it is scheduled)
 *   available   legible and lit – you can open it now
 *   completed   stabilised and archived
 *   failed      sealed
 */
export type UState = "locked" | "discovered" | "available" | "completed" | "failed";
export type Shape = "ico" | "box" | "octa" | "prism" | "ring";
export type Vec3 = [number, number, number];

export interface NodeSignals {
  discoveries: number;
  contradictions: number;
  wrong: number;
  hints: number;
}

export interface UNodeIn {
  id: string;
  /** null while the file is still classified. */
  title: string | null;
  state: Availability;
  family: string;
  actIndex: number;
  roundIndex: number;
  indexInRound: number;
  roundSize: number;
  points: number;
  minutes: number;
  optional: boolean;
  isNew: boolean;
  opensAt: string | null;
  /** Fraction (0…1) of a locked file's requirements already met. */
  progress: number;
  signals: NodeSignals;
  /** What a locked file still needs, exactly as much as the team is allowed to know. */
  requirements?: { ok: boolean; text: string; depth: number }[];
  /** Free-form extra data for non-player modes (ops heat, author depth…). */
  meta?: Record<string, number | string | boolean>;
}

export interface UEdgeIn {
  from: string;
  to: string;
  kind: "gate" | "evidence" | "fact" | "checkpoint";
}

export interface UActIn {
  id: string;
  title: string | null;
  started: boolean;
  complete: boolean;
}

export interface UniverseInput {
  nodes: UNodeIn[];
  edges: UEdgeIn[];
  acts: UActIn[];
}

export interface UNode {
  id: string;
  index: number;
  title: string | null;
  state: UState;
  availability: Availability;
  family: string;
  shape: Shape;
  actIndex: number;
  pos: Vec3;
  /** The same file on the planar map (acts as columns): used by the 2-D rendering. */
  flat: [number, number];
  rot: number;
  radius: number;
  /** 0…1 brightness/legibility budget. */
  energy: number;
  isNew: boolean;
  scheduled: boolean;
  suspicious: boolean;
  points: number;
  minutes: number;
  optional: boolean;
  progress: number;
  signals: NodeSignals;
  requirements: { ok: boolean; text: string; depth: number }[];
  opensAt: string | null;
  meta: Record<string, number | string | boolean>;
  label: string;
}

export interface UEdge {
  from: number;
  to: number;
  kind: UEdgeIn["kind"];
  a: Vec3;
  b: Vec3;
  ctrl: Vec3;
  /** dormant: source is known but not finished; live: source done, target open; done: both finished. */
  flow: "dormant" | "live" | "done";
}

export interface UniverseModel {
  layout: UniverseLayout;
  nodes: UNode[];
  edges: UEdge[];
  /**
   * `anchor`: where the act's name hangs in space (a slab's corner, a constellation's crown,
   * the header strip over a wall column, a channel marker in the tunnel). `span`: the act's
   * width on the wall (header strips are cut to it).
   */
  acts: (UActIn & { index: number; z: number; count: number; done: number; anchor: Vec3; span: number })[];
  byId: Map<string, number>;
  /** Where the investigation currently is; the camera rests here. */
  focus: Vec3;
  bounds: { center: Vec3; radius: number; min: Vec3; max: Vec3 };
  counts: Record<UState, number> & { total: number; new: number; suspicious: number };
}

/* ─────────────────────────── State mapping ─────────────────────────── */

export function presentationState(n: { state: Availability; progress: number }): UState {
  switch (n.state) {
    case "solved":
      return "completed";
    case "failed":
      return "failed";
    case "open":
      return "available";
    case "scheduled":
      return "discovered";
    case "locked":
      return n.progress > 0 ? "discovered" : "locked";
  }
}

/** A file that is resisting or has produced an anomaly (contradiction, partial find, repeated misses). */
export function isSuspicious(s: NodeSignals, state: UState): boolean {
  if (state === "completed" || state === "locked") return false;
  return s.contradictions > 0 || s.wrong >= 3 || (state === "available" && s.discoveries > 0);
}

const ENERGY: Record<UState, number> = { locked: 0.14, discovered: 0.46, available: 1, completed: 0.62, failed: 0.28 };

export const FAMILY_SHAPE: Record<string, Shape> = {
  cryptic: "ico",
  browser: "box",
  forensics: "octa",
  ctf: "prism",
  osint: "ico",
  inquest: "prism",
  physical: "ring",
  final: "octa",
  custom: "box",
};
export const FAMILY_GLYPH = ["cryptic", "browser", "forensics", "ctf", "osint", "inquest", "physical", "final", "custom"] as const;

export function shapeOf(family: string): Shape {
  return FAMILY_SHAPE[family] ?? "box";
}

/* ─────────────────────────── Layouts ─────────────────────────── */

type Placement = { pos: Vec3; rot: number };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotateZ(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

interface LayoutCtx {
  nodes: UNodeIn[];
  rotation: number;
  seed: string;
}

function roundsByAct(nodes: UNodeIn[]) {
  const acts = new Map<number, number[]>();
  for (const n of nodes) {
    const list = acts.get(n.actIndex) ?? [];
    if (!list.includes(n.roundIndex)) list.push(n.roundIndex);
    acts.set(n.actIndex, list.sort((a, b) => a - b));
  }
  return acts;
}

/** How far each strata layer's outline reaches past the files it holds (the scene draws them; labels sit on their corners). */
export const STRATA_MARGIN = { x: 9, y: 6 } as const;

/** Tactical strata: each act is a layer receding into depth; rounds are columns. */
function layoutStrata({ nodes, rotation, seed }: LayoutCtx): Placement[] {
  const r = prng(`${seed}:strata`);
  const rounds = roundsByAct(nodes);
  const ACT_GAP = 15;
  return nodes.map((n) => {
    const local = rounds.get(n.actIndex)!;
    const rl = local.indexOf(n.roundIndex);
    const x = (rl - (local.length - 1) / 2) * 10.5 + ((n.indexInRound % 2) - 0.5) * 3.6 + (r() - 0.5) * 1.1;
    const y = ((n.roundSize - 1) / 2 - n.indexInRound) * 3.5 + (r() - 0.5) * 0.9;
    const z = -n.actIndex * ACT_GAP + (r() - 0.5) * 2.6;
    return { pos: rotateY([x, y, z], rotation * 0.35), rot: 0 };
  });
}

/** Neural clusters: rounds are constellations on a golden-angle spiral, files orbit their round. */
function layoutOrganic({ nodes, rotation, seed }: LayoutCtx): Placement[] {
  const r = prng(`${seed}:organic`);
  const rounds = [...new Set(nodes.map((n) => n.roundIndex))].sort((a, b) => a - b);
  const R = rounds.length;
  const S = 9 + R * 0.6;
  const centers = new Map<number, Vec3>();
  rounds.forEach((ri, k) => {
    const y = R === 1 ? 0 : 1 - (k / (R - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GOLDEN * k + rotation;
    const outward = 1 + (nodes.find((n) => n.roundIndex === ri)?.actIndex ?? 0) * 0.05;
    centers.set(ri, [Math.cos(th) * rad * S * outward, y * S * 0.62, Math.sin(th) * rad * S * outward]);
  });
  return nodes.map((n) => {
    const c = centers.get(n.roundIndex)!;
    if (n.roundSize <= 1) return { pos: [c[0] + (r() - 0.5) * 0.6, c[1] + (r() - 0.5) * 0.6, c[2] + (r() - 0.5) * 0.6] as Vec3, rot: 0 };
    const j = n.indexInRound;
    const ly = 1 - ((j + 0.5) / n.roundSize) * 2;
    const lr = Math.sqrt(Math.max(0, 1 - ly * ly));
    const lt = GOLDEN * j;
    const rad = 2.4 + n.roundSize * 0.42;
    return { pos: [c[0] + Math.cos(lt) * lr * rad, c[1] + ly * rad, c[2] + Math.sin(lt) * lr * rad], rot: 0 };
  });
}

/** Card pitch on the evidence wall (world units): a 2.7 × 3.3 index card plus the gap a hand leaves. */
export const WALL_PITCH = { x: 3.95, y: 4.75, actGap: 1.9 } as const;

/**
 * The evidence wall: every act is a column (or a few) of pinned index cards
 * under a typed header strip, story order running left to right and down each
 * column. How many cards stack in a column is chosen so the whole wall comes
 * out roughly the shape of a screen instead of a ribbon, whatever the case's
 * proportions. Cards keep a hand-pinned tilt; nothing overlaps.
 */
function layoutWall({ nodes, rotation, seed }: LayoutCtx): Placement[] {
  return wallGeometry({ nodes, rotation, seed }).place;
}

function wallGeometry({ nodes, rotation, seed }: LayoutCtx): { place: Placement[]; acts: Map<number, { x: number; y: number; span: number }> } {
  const r = prng(`${seed}:wall`);
  const actIds = [...new Set(nodes.map((n) => n.actIndex))].sort((a, b) => a - b);
  const order = new Map<number, number[]>();
  nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.actIndex - b.n.actIndex || a.n.roundIndex - b.n.roundIndex || a.n.indexInRound - b.n.indexInRound)
    .forEach(({ n, i }) => order.set(n.actIndex, [...(order.get(n.actIndex) ?? []), i]));
  const { x: PX, y: PY, actGap } = WALL_PITCH;
  // Pick the column height whose wall is closest to the shape of the map beside its index panel (~1.65:1).
  const most = Math.max(1, ...actIds.map((a) => order.get(a)!.length));
  let rows = 1;
  let best = Infinity;
  for (let R = 1; R <= most; R++) {
    const cols = actIds.reduce((s, a) => s + Math.ceil(order.get(a)!.length / R), 0);
    const W = cols * PX + (actIds.length - 1) * actGap;
    const H = R * PY + 2.2;
    const score = Math.abs(Math.log(W / H / 1.65));
    if (score < best - 1e-9) {
      best = score;
      rows = R;
    }
  }
  const totalCols = actIds.reduce((s, a) => s + Math.ceil(order.get(a)!.length / rows), 0);
  const width = totalCols * PX + (actIds.length - 1) * actGap;
  const place: Placement[] = nodes.map(() => ({ pos: [0, 0, 0] as Vec3, rot: 0 }));
  const acts = new Map<number, { x: number; y: number; span: number }>();
  let left = -width / 2;
  const top = ((rows - 1) * PY) / 2;
  for (const a of actIds) {
    const ids = order.get(a)!;
    const cols = Math.ceil(ids.length / rows);
    ids.forEach((i, k) => {
      const col = Math.floor(k / rows);
      const row = k % rows;
      const x = left + (col + 0.5) * PX + (r() - 0.5) * 0.5;
      const y = top - row * PY + (r() - 0.5) * 0.45;
      place[i] = { pos: rotateZ([x, y, r() * 0.35], rotation * 0.05), rot: (r() - 0.5) * 0.13 };
    });
    acts.set(a, { x: left + (cols * PX) / 2, y: top + PY * 0.5 + 0.9, span: cols * PX - 0.5 });
    left += cols * PX + actGap;
  }
  return { place, acts };
}

/**
 * The planar map the flat (SVG) rendering uses: acts as wide columns so it reads
 * left to right like the story, rounds stacked inside them.
 */
function layoutPlanar({ nodes, rotation, seed }: LayoutCtx): Placement[] {
  const r = prng(`${seed}:wall`);
  const rounds = roundsByAct(nodes);
  const acts = [...rounds.keys()].sort((a, b) => a - b);
  const A = acts.length;
  // Cumulative vertical offset of each round within its act.
  const yOff = new Map<number, number>();
  const rowsOf = (ri: number) => Math.ceil(nodes.filter((n) => n.roundIndex === ri).length / 2);
  for (const a of acts) {
    let y = 0;
    for (const ri of rounds.get(a)!) {
      yOff.set(ri, y);
      y += rowsOf(ri) * 4.2 + 2.6;
    }
  }
  return nodes.map((n) => {
    const col = n.indexInRound % 2;
    const row = Math.floor(n.indexInRound / 2);
    const x = (acts.indexOf(n.actIndex) - (A - 1) / 2) * 14.5 + (col - 0.5) * 6.2 + (r() - 0.5) * 0.8;
    const y = -(yOff.get(n.roundIndex)! + row * 4.2) + (r() - 0.5) * 0.7 + 8;
    return { pos: rotateZ([x, y, r() * 0.9], rotation * 0.08), rot: (r() - 0.5) * 0.12 };
  });
}

/** Signal tunnel: one continuous helix; progress is distance travelled. */
function layoutTunnel({ nodes, rotation }: LayoutCtx): Placement[] {
  const order = [...nodes].sort((a, b) => a.actIndex - b.actIndex || a.roundIndex - b.roundIndex || a.indexInRound - b.indexInRound);
  const at = new Map(order.map((n, i) => [n.id, i]));
  return nodes.map((n) => {
    const i = at.get(n.id)!;
    const ang = i * 0.86 + rotation;
    const rad = 5.2 + Math.sin(i * 1.3) * 1.5;
    return { pos: [Math.cos(ang) * rad, Math.sin(ang) * rad * 0.62, -i * 2.9] as Vec3, rot: 0 };
  });
}

const LAYOUTS: Record<UniverseLayout, (c: LayoutCtx) => Placement[]> = {
  strata: layoutStrata,
  organic: layoutOrganic,
  wall: layoutWall,
  tunnel: layoutTunnel,
};

/* ─────────────────────────── Builder ─────────────────────────── */

export interface BuildOptions {
  layout: UniverseLayout;
  /** Per-team cosmetic rotation (radians). */
  rotation?: number;
  seed?: string;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function len(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function nodeLabel(n: { title: string | null; state: UState; family: string; points: number; scheduled: boolean }): string {
  const what = n.title ?? "Classified file";
  const st = n.scheduled ? "scheduled" : n.state === "discovered" ? "in sight" : n.state === "available" ? "open" : n.state;
  return `${what}: ${st}, ${n.family}${n.state === "locked" ? "" : `, ${n.points} points`}`;
}

/** Where a string is fastened on a pinned card: the pin at the top of the card, just proud of the paper. */
export function wallPin(n: { pos: Vec3; rot: number; radius: number }): Vec3 {
  const p = rotateZ([0, 1.5 * n.radius, 0.14], n.rot);
  return [n.pos[0] + p[0], n.pos[1] + p[1], n.pos[2] + p[2]];
}

export function buildUniverse(input: UniverseInput, opts: BuildOptions): UniverseModel {
  const rotation = opts.rotation ?? 0;
  const seed = opts.seed ?? "dossier";
  const wall = opts.layout === "wall";
  const wallGeo = wall ? wallGeometry({ nodes: input.nodes, rotation, seed }) : null;
  const place = wallGeo ? wallGeo.place : LAYOUTS[opts.layout]({ nodes: input.nodes, rotation, seed });
  const planar = layoutPlanar({ nodes: input.nodes, rotation: 0, seed });

  const nodes: UNode[] = input.nodes.map((n, i) => {
    const state = presentationState(n);
    const final = n.family === "final";
    // Cards on a wall share a pitch: the finale is a bigger card, not a poster that covers its neighbours.
    const scale = final ? (wall ? 1.18 : 1.6) : n.optional ? (wall ? 0.88 : 0.78) : 1;
    const pts = Math.min(1.2, Math.max(0.9, 0.9 + n.points / 1500));
    const suspicious = isSuspicious(n.signals, state);
    const p = place[i]!;
    const scheduled = n.state === "scheduled";
    return {
      id: n.id,
      index: i,
      title: n.title,
      state,
      availability: n.state,
      family: n.family,
      shape: shapeOf(n.family),
      actIndex: n.actIndex,
      pos: p.pos,
      flat: [planar[i]!.pos[0], planar[i]!.pos[1]],
      rot: p.rot,
      radius: wall ? scale : 1 * scale * pts,
      energy: ENERGY[state] * (state === "discovered" ? 0.7 + 0.3 * n.progress : 1),
      isNew: n.isNew && state === "available",
      scheduled,
      suspicious,
      points: n.points,
      minutes: n.minutes,
      optional: n.optional,
      progress: n.progress,
      signals: n.signals,
      requirements: n.requirements ?? [],
      opensAt: n.opensAt,
      meta: n.meta ?? {},
      label: nodeLabel({ title: n.title, state, family: n.family, points: n.points, scheduled }),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n.index]));

  // Centre of mass of the layout, used to bow strings/edges outward (organic) or downward (wall).
  const cm: Vec3 = nodes.length ? [nodes.reduce((s, n) => s + n.pos[0], 0) / nodes.length, nodes.reduce((s, n) => s + n.pos[1], 0) / nodes.length, nodes.reduce((s, n) => s + n.pos[2], 0) / nodes.length] : [0, 0, 0];

  const edges: UEdge[] = [];
  const seen = new Set<string>();
  for (const e of input.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const A = nodes[from]!;
    const B = nodes[to]!;
    // On the wall a string runs pin to pin, in front of the paper; elsewhere a thread joins the files' centres.
    const a = wall ? wallPin(A) : A.pos;
    const b = wall ? wallPin(B) : B.pos;
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const d = len(sub(b, a));
    let ctrl: Vec3 = mid;
    if (opts.layout === "organic") {
      const out = sub(mid, cm);
      const L = len(out) || 1;
      ctrl = [mid[0] + (out[0] / L) * d * 0.18, mid[1] + (out[1] / L) * d * 0.18, mid[2] + (out[2] / L) * d * 0.18];
    } else if (wall) {
      // Real string sags under its own weight; a long run sags more, never through the floor.
      ctrl = [mid[0], mid[1] - Math.min(3.2, 0.6 + d * 0.13), mid[2] + 0.25];
    } else if (opts.layout === "strata") {
      ctrl = [mid[0], mid[1] + d * 0.05, mid[2] + d * 0.12];
    }
    const flow = A.state === "completed" && B.state === "completed" ? "done" : A.state === "completed" ? "live" : "dormant";
    edges.push({ from, to, kind: e.kind, a, b, ctrl, flow });
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const n of nodes) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k]!, n.pos[k]!);
    max[k] = Math.max(max[k]!, n.pos[k]!);
  }
  if (!nodes.length) {
    min.fill(0);
    max.fill(0);
  }
  const center: Vec3 = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  const radius = Math.max(8, len(sub(max, min)) / 2);

  // Acts: a slab per act (depth for strata/tunnel, column for wall), each with a place for its name.
  const acts = input.acts.map((a, index) => {
    const ns = nodes.filter((n) => n.actIndex === index);
    const z = ns.length ? ns.reduce((s, n) => s + n.pos[2], 0) / ns.length : 0;
    let anchor: Vec3 = [0, 0, z];
    let span = 0;
    if (ns.length) {
      const xs = ns.map((n) => n.pos[0]);
      const ys = ns.map((n) => n.pos[1]);
      const c: Vec3 = [xs.reduce((s, v) => s + v, 0) / ns.length, ys.reduce((s, v) => s + v, 0) / ns.length, z];
      const head = wallGeo?.acts.get(index);
      if (head) {
        anchor = [head.x, head.y, 0.05];
        span = head.span;
      } else if (opts.layout === "strata") {
        // The top-left corner of the act's layer (the scene draws every layer at the same footprint).
        anchor = [min[0] - STRATA_MARGIN.x + 0.6, max[1] + STRATA_MARGIN.y - 0.4, z - 2.2];
      } else if (opts.layout === "tunnel") {
        // Channel markers ride on the first file of the act, where the act's stretch of tunnel begins.
        const first = ns.reduce((m, n) => (n.pos[2] > m.pos[2] ? n : m), ns[0]!);
        anchor = [first.pos[0] * 1.35, first.pos[1] * 1.35 + 1.6, first.pos[2]];
      } else anchor = [c[0], Math.max(...ys) + 2.4, c[2]];
    }
    return { ...a, index, z, count: ns.length, done: ns.filter((n) => n.state === "completed").length, anchor, span };
  });

  const counts = {
    locked: 0,
    discovered: 0,
    available: 0,
    completed: 0,
    failed: 0,
    total: nodes.length,
    new: nodes.filter((n) => n.isNew).length,
    suspicious: nodes.filter((n) => n.suspicious).length,
  };
  for (const n of nodes) counts[n.state]++;

  // The frontier: open files; else the freshest thing in sight; else the last thing finished.
  const pick = (f: (n: UNode) => boolean) => nodes.filter(f);
  const frontier = pick((n) => n.state === "available").length ? pick((n) => n.state === "available") : pick((n) => n.state === "discovered").length ? pick((n) => n.state === "discovered") : pick((n) => n.state === "completed").slice(-3);
  const focusSet = frontier.length ? frontier : nodes;
  const focus: Vec3 = focusSet.length
    ? [focusSet.reduce((s, n) => s + n.pos[0], 0) / focusSet.length, focusSet.reduce((s, n) => s + n.pos[1], 0) / focusSet.length, focusSet.reduce((s, n) => s + n.pos[2], 0) / focusSet.length]
    : [0, 0, 0];

  return { layout: opts.layout, nodes, edges, acts, byId, focus, bounds: { center, radius, min, max }, counts };
}

/* ─────────────────────────── Projections for other modes ─────────────────────────── */

/** Which node a keyboard user lands on next (spatial order = story order). */
export function readingOrder(m: UniverseModel): UNode[] {
  const weight: Record<UState, number> = { available: 0, discovered: 1, completed: 2, failed: 3, locked: 4 };
  return [...m.nodes].sort((a, b) => weight[a.state] - weight[b.state] || a.actIndex - b.actIndex || a.index - b.index);
}

/**
 * 2-D projection for the SVG rendering: the planar map (acts as columns, so it
 * reads left to right like the story). `window` fits only some acts to the box
 * (the "focus" posture); everything else stays in place, clipped by the view.
 */
export function flatten(m: UniverseModel, w: number, h: number, pad = 48, window?: { from: number; to: number }) {
  const inWin = (n: UNode) => !window || (n.actIndex >= window.from && n.actIndex <= window.to);
  const fit = m.nodes.filter(inWin);
  const set = fit.length ? fit : m.nodes;
  const xs = set.map((n) => n.flat[0]);
  const ys = set.map((n) => n.flat[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const s = Math.min((w - pad * 2) / Math.max(4, x1 - x0), (h - pad * 2) / Math.max(4, y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2 - x0 * s;
  const oy = (h - (y1 - y0) * s) / 2 + y1 * s;
  return {
    scale: s,
    nodes: m.nodes.map((n) => ({ x: n.flat[0] * s + ox, y: -n.flat[1] * s + oy, depth: n.pos[2] })),
  };
}
