import type { BlueprintT, NodeDef } from "../core/blueprint";
import { difficultyScore, profile, textOnlySolvability, type DifficultyProfile, type InteractionProfile } from "../core/difficulty";
import { gateRefs, hardNodeDeps, type Gate } from "../core/gates";
import { templateRefs } from "../core/template";
import { getPrimitive } from "../primitives/registry";
import { factGraph, type FactGraph } from "../world";

/**
 * Static analysis of a blueprint: the challenge graph as organisers see it.
 * Everything here is pure and derived — Studio's graph view, the validator,
 * the planner and publish-time materialisation all use the same numbers.
 */

export interface NodeAnalysis {
  id: string;
  /** Longest chain of prerequisites (gates + fact flow) ending in this node, counting the node itself. */
  dependencyDepth: number;
  /** Nodes this node directly depends on (hard gate deps, evidence producers, fact producers). */
  deps: string[];
  factDeps: string[];
  profile: DifficultyProfile;
  score: number;
  interaction: InteractionProfile;
  textOnly: number;
  skills: string[];
  tools: string[];
  perTeam: boolean;
  estimatedMinutes: number;
  /** Earliest cumulative minutes at which a team could plausibly finish this node (critical path). */
  earliestFinish: number;
  configError: string | null;
}

export interface BlueprintAnalysis {
  nodes: Map<string, NodeAnalysis>;
  facts: FactGraph;
  evidenceProducers: Map<string, string[]>;
  criticalPath: string[];
  criticalMinutes: number;
  totalMinutes: number;
  maxDepth: number;
  edges: { from: string; to: string; kind: "gate" | "evidence" | "fact" | "checkpoint"; hidden: boolean }[];
}

function gateNodes(g: Gate | undefined, hidden = false, out: { id: string; hidden: boolean; soft: boolean }[] = [], soft = false) {
  if (!g) return out;
  if ("discovery" in g) out.push({ id: g.node, hidden, soft });
  else if ("node" in g) out.push({ id: g.node, hidden, soft });
  else if ("all" in g) g.all.forEach((x) => gateNodes(x, hidden, out, soft));
  else if ("any" in g) g.any.forEach((x) => gateNodes(x, hidden, out, true));
  else if ("atLeast" in g) g.of.forEach((x) => gateNodes(x, hidden, out, true));
  else if ("hidden" in g) gateNodes(g.hidden, true, out, soft);
  return out;
}

export function evidenceProducers(bp: BlueprintT): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of bp.nodes) for (const e of n.rewards.evidence) m.set(e, [...(m.get(e) ?? []), n.id]);
  // Interview reveals also produce evidence.
  for (const n of bp.nodes) {
    if (n.primitive !== "interview") continue;
    const cfg = n.config as { topics?: { reveals?: { evidence?: string[] } }[]; confrontations?: { reveals?: { evidence?: string[] } }[] };
    for (const x of [...(cfg.topics ?? []), ...(cfg.confrontations ?? [])]) for (const e of x.reveals?.evidence ?? []) m.set(e, [...(m.get(e) ?? []), n.id]);
  }
  return m;
}

export function analyzeBlueprint(bp: BlueprintT): BlueprintAnalysis {
  const facts = factGraph(bp);
  const producers = evidenceProducers(bp);
  const evidenceGates = new Map(bp.evidence.map((e) => [e.id, e.gate]));
  const byId = new Map(bp.nodes.map((n) => [n.id, n]));
  const edges: BlueprintAnalysis["edges"] = [];
  const directDeps = new Map<string, Set<string>>();

  for (const n of bp.nodes) {
    const deps = new Set<string>();
    for (const x of gateNodes(n.gate)) {
      if (!byId.has(x.id)) continue;
      edges.push({ from: x.id, to: n.id, kind: "gate", hidden: x.hidden });
      if (!x.soft) deps.add(x.id);
    }
    const refs = gateRefs(n.gate);
    for (const ev of refs.evidence) {
      const ps = producers.get(ev) ?? [];
      for (const p of ps) edges.push({ from: p, to: n.id, kind: "evidence", hidden: false });
      if (ps.length === 1) deps.add(ps[0]!);
      // Evidence auto-granted by its own gate depends on whatever that gate needs.
      for (const d of hardNodeDeps(evidenceGates.get(ev))) deps.add(d);
    }
    for (const cp of refs.checkpoints) {
      const qr = bp.nodes.find((m) => (m.primitive === "qr-checkpoint" || m.primitive === "gps-checkpoint") && (m.config as { checkpoint?: string }).checkpoint === cp);
      if (qr && qr.id !== n.id) {
        edges.push({ from: qr.id, to: n.id, kind: "checkpoint", hidden: false });
        deps.add(qr.id);
      }
    }
    for (const f of facts.consumes.get(n.id) ?? []) {
      edges.push({ from: f, to: n.id, kind: "fact", hidden: false });
      deps.add(f);
    }
    deps.delete(n.id);
    directDeps.set(n.id, deps);
  }

  const depth = new Map<string, number>();
  const finish = new Map<string, number>();
  const visiting = new Set<string>();
  const walk = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 1; // cycle: reported by the validator
    visiting.add(id);
    let d = 0;
    let f = 0;
    for (const x of directDeps.get(id) ?? []) {
      d = Math.max(d, walk(x));
      f = Math.max(f, finish.get(x) ?? 0);
    }
    visiting.delete(id);
    depth.set(id, d + 1);
    finish.set(id, f + (byId.get(id)?.estimatedMinutes ?? 0));
    return d + 1;
  };
  bp.nodes.forEach((n) => walk(n.id));

  const nodes = new Map<string, NodeAnalysis>();
  for (const n of bp.nodes) nodes.set(n.id, analyzeNode(bp, n, depth.get(n.id)!, [...directDeps.get(n.id)!], [...(facts.consumes.get(n.id) ?? [])], finish.get(n.id)!));

  // Critical path: walk back from the node with the latest finish.
  const last = [...finish.entries()].sort((a, b) => b[1] - a[1])[0];
  const criticalPath: string[] = [];
  let cur = last?.[0];
  while (cur) {
    criticalPath.unshift(cur);
    const next: string | undefined = [...(directDeps.get(cur) ?? [])].sort((a, b) => (finish.get(b) ?? 0) - (finish.get(a) ?? 0))[0];
    cur = next && !criticalPath.includes(next) ? next : undefined;
  }
  return {
    nodes,
    facts,
    evidenceProducers: producers,
    criticalPath,
    criticalMinutes: last?.[1] ?? 0,
    totalMinutes: bp.nodes.filter((n) => !n.optional).reduce((s, n) => s + n.estimatedMinutes, 0),
    maxDepth: Math.max(0, ...depth.values()),
    edges,
  };
}

function analyzeNode(bp: BlueprintT, n: NodeDef, depth: number, deps: string[], factDeps: string[], earliestFinish: number): NodeAnalysis {
  const p = getPrimitive(n.primitive);
  let base = profile({});
  let described = { skills: [] as string[], tools: [] as string[], interaction: { channels: ["text"], textExposure: 0.5 } as InteractionProfile };
  let configError: string | null = null;
  if (!p) configError = `unknown primitive "${n.primitive}"`;
  else {
    const parsed = p.schema.safeParse(n.config);
    if (!parsed.success) configError = parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ");
    else {
      base = p.difficulty(parsed.data);
      described = p.describe(parsed.data);
    }
  }
  const templated = templateRefs(n.config).size > 0;
  const herring = n.redHerring ? bp.redHerrings.find((r) => r.id === n.redHerring) : undefined;
  const prof: DifficultyProfile = profile({
    ...base,
    dependencyDepth: Math.max(base.dependencyDepth, Math.min(10, ((depth - 1) * 10) / 6)),
    redHerringDensity: Math.min(10, base.redHerringDensity + (herring ? herring.plausibility * 4 : 0)),
    instanceUniqueness: templated ? Math.max(base.instanceUniqueness, 7) : Math.min(base.instanceUniqueness, 3),
    crossModalComplexity: Math.min(10, base.crossModalComplexity + Math.min(3, factDeps.length)),
  });
  return {
    id: n.id,
    dependencyDepth: depth,
    deps,
    factDeps,
    profile: prof,
    score: difficultyScore(prof),
    interaction: described.interaction,
    textOnly: textOnlySolvability(described.interaction, prof, false),
    skills: [...new Set([...n.skills, ...described.skills])],
    tools: [...new Set([...n.tools, ...described.tools])],
    perTeam: templated || prof.instanceUniqueness >= 7,
    estimatedMinutes: n.estimatedMinutes,
    earliestFinish,
    configError,
  };
}
