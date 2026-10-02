import type { BlueprintT } from "../core/blueprint";
import { difficultyScore } from "../core/difficulty";
import { gateRefs, type Gate } from "../core/gates";
import { getPrimitive } from "../primitives/registry";
import { analyzeBlueprint, evidenceProducers } from "./analysis";

/**
 * "MAKE IT HARDER": structural transforms, each reported with exactly what
 * changed. Difficulty rises by adding stages, channels, decoys, state and
 * cross-source dependencies — never by lengthening strings.
 */

export interface Change {
  node: string;
  kind: "structure" | "dependency" | "clues" | "decoys";
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface HardenResult {
  blueprint: BlueprintT;
  changes: Change[];
  scoreBefore: number;
  scoreAfter: number;
  depthBefore: number;
  depthAfter: number;
}

function withGate(existing: Gate | undefined, extra: Gate): Gate {
  if (!existing) return extra;
  if ("all" in existing) return { all: [...existing.all, extra] };
  return { all: [existing, extra] };
}

export function hardenNode(bp: BlueprintT, nodeId: string): HardenResult {
  const out = structuredClone(bp);
  const before = analyzeBlueprint(bp);
  const n = out.nodes.find((x) => x.id === nodeId);
  if (!n) throw new Error(`unknown node "${nodeId}"`);
  const changes: Change[] = [];

  // 1. The primitive's own structural transform (two-stage clue, more channels, stego, decoys…).
  const p = getPrimitive(n.primitive);
  if (p?.harden) {
    const parsed = p.schema.safeParse(n.config);
    if (parsed.success) {
      const h = p.harden(parsed.data);
      if (h) {
        changes.push({ node: n.id, kind: "structure", summary: h.changes.join("; "), before: n.config, after: h.config });
        n.config = h.config as Record<string, unknown>;
      }
    }
  }

  // 2. One source → cross-source: require evidence produced in an earlier round (visible requirement).
  const roundIdx = out.rounds.findIndex((r) => r.id === n.round);
  const producers = evidenceProducers(out);
  const already = gateRefs(n.gate).evidence;
  const candidates = out.evidence.filter((e) => {
    if (already.has(e.id)) return false;
    const ps = producers.get(e.id) ?? [];
    return ps.length > 0 && ps.every((pid) => {
      const pr = out.nodes.find((x) => x.id === pid);
      const ri = out.rounds.findIndex((r) => r.id === pr?.round);
      return pr && !pr.optional && ri >= 0 && ri < roundIdx && pid !== n.id;
    });
  });
  const pick = candidates.at(-1);
  if (pick && roundIdx > 0) {
    const g = withGate(n.gate, { evidence: pick.id });
    changes.push({ node: n.id, kind: "dependency", summary: `Now also requires "${pick.title}" from an earlier round (cross-round dependency)`, before: n.gate ?? null, after: g });
    n.gate = g;
  }

  // 3. Fewer direct clues: the cheapest non-explicit hint goes, the rest cost more.
  if (n.hints.length > 1) {
    const beforeHints = structuredClone(n.hints);
    const drop = n.hints.findIndex((h) => h.level === "nudge");
    if (drop >= 0) n.hints.splice(drop, 1);
    n.hints = n.hints.map((h) => ({ ...h, cost: Math.round(((h.cost ?? out.hintEconomy.costs[h.level]) * 1.5) / 5) * 5 }));
    changes.push({ node: n.id, kind: "clues", summary: "Removed the gentlest nudge; remaining hints cost 50% more", before: beforeHints, after: n.hints });
  }

  const after = analyzeBlueprint(out);
  return {
    blueprint: out,
    changes,
    scoreBefore: before.nodes.get(nodeId)!.score,
    scoreAfter: after.nodes.get(nodeId)!.score,
    depthBefore: before.nodes.get(nodeId)!.dependencyDepth,
    depthAfter: after.nodes.get(nodeId)!.dependencyDepth,
  };
}

export function hardenRound(bp: BlueprintT, roundId: string): HardenResult {
  let cur = bp;
  const changes: Change[] = [];
  const ids = bp.nodes.filter((n) => n.round === roundId).map((n) => n.id);
  const a0 = analyzeBlueprint(bp);
  for (const id of ids) {
    const r = hardenNode(cur, id);
    cur = r.blueprint;
    changes.push(...r.changes);
  }
  const a1 = analyzeBlueprint(cur);
  const avg = (a: ReturnType<typeof analyzeBlueprint>) => (ids.length ? ids.reduce((s, id) => s + difficultyScore(a.nodes.get(id)!.profile), 0) / ids.length : 0);
  return {
    blueprint: cur,
    changes,
    scoreBefore: Math.round(avg(a0)),
    scoreAfter: Math.round(avg(a1)),
    depthBefore: Math.max(0, ...ids.map((id) => a0.nodes.get(id)!.dependencyDepth)),
    depthAfter: Math.max(0, ...ids.map((id) => a1.nodes.get(id)!.dependencyDepth)),
  };
}
