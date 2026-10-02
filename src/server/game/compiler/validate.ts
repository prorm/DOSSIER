import { env } from "../../env";
import { signToken, verifyToken } from "../../security/crypto";
import { hintCost, type BlueprintT } from "../core/blueprint";
import { gateRefs, hardNodeDeps } from "../core/gates";
import { templateErrors } from "../core/template";
import { TIERS } from "../core/difficulty";
import { getPrimitive } from "../primitives/registry";
import { buildWorld, factGraph, renderText, type TeamWorld } from "../world";
import { analyzeBlueprint, evidenceProducers } from "./analysis";
import { scanLeaks, staticPayloads, variants } from "./leak";
import { browserSolver, forensicSolver, playthrough, textSolver, type SolverReport } from "./solvers";
import { textOnlySolvability } from "../core/difficulty";

/**
 * Publish-time compiler validation. Every check the organiser sees in Studio's
 * "Validate" tab comes from here, and packs cannot be imported with errors.
 */

export type CheckId =
  | "schema"
  | "references"
  | "reachable"
  | "dependencies"
  | "dead-ends"
  | "intended-solution"
  | "state-transitions"
  | "answer-leakage"
  | "static-js"
  | "seeds"
  | "hints"
  | "scoring"
  | "narrative"
  | "red-herrings"
  | "checkpoints"
  | "qr-tokens"
  | "duration"
  | "difficulty"
  | "duplicates";

export const CHECKS: { id: CheckId; label: string }[] = [
  { id: "schema", label: "Every node config is valid for its primitive" },
  { id: "references", label: "Every reference resolves (rounds, gates, rewards, sites)" },
  { id: "reachable", label: "Every node is reachable" },
  { id: "dependencies", label: "No impossible dependency (gates, fact flow, cycles)" },
  { id: "dead-ends", label: "No dead end on the critical path" },
  { id: "intended-solution", label: "Every challenge has a working intended solution" },
  { id: "state-transitions", label: "Every solution produces a valid state transition" },
  { id: "answer-leakage", label: "No answer exposed client-side" },
  { id: "static-js", label: "No secret embedded in static JS / source maps" },
  { id: "seeds", label: "Per-team seeds are deterministic and vary answers" },
  { id: "hints", label: "Hints render and do not give away answers early" },
  { id: "scoring", label: "Scoring is valid" },
  { id: "narrative", label: "Narrative references are valid" },
  { id: "red-herrings", label: "Red herrings are falsifiable" },
  { id: "checkpoints", label: "Physical checkpoints exist and are configured" },
  { id: "qr-tokens", label: "QR tokens sign and verify" },
  { id: "duration", label: "Estimated duration fits the event" },
  { id: "difficulty", label: "Difficulty curve matches round tiers" },
  { id: "duplicates", label: "No duplicate mechanics in a row" },
];

export interface Issue {
  check: CheckId;
  severity: "error" | "warning";
  node?: string;
  message: string;
}

export interface NodeQuality {
  id: string;
  title: string;
  primitive: string;
  depth: number;
  score: number;
  perTeam: boolean;
  textOnly: number;
  solvers: SolverReport;
}

export interface ValidationReport {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  checks: { id: CheckId; label: string; status: "pass" | "warn" | "fail"; count: number }[];
  quality: NodeQuality[];
  stats: { nodes: number; maxDepth: number; criticalMinutes: number; totalMinutes: number; durationMinutes: number; solvedInPlaythrough: number };
}

function uniq(ids: string[], what: string, push: (m: string) => void) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) push(`duplicate ${what} id "${id}"`);
    seen.add(id);
  }
}

/** A measured phase of a validation run (Studio's build trace). Observational only: nothing here changes a verdict. */
export interface ValidationPhase {
  id: "structure" | "instances" | "playthrough" | "leakage" | "solvers" | "rules";
  label: string;
  ms: number;
  metrics: { label: string; value: string | number }[];
}

export async function validateBlueprint(bp: BlueprintT, opts: { plaintext?: Map<string, string[]>; samples?: number; secret?: string; onPhase?: (p: ValidationPhase) => void } = {}): Promise<ValidationReport> {
  let lapAt = performance.now();
  const lap = (id: ValidationPhase["id"], label: string, metrics: ValidationPhase["metrics"] = []) => {
    const now = performance.now();
    opts.onPhase?.({ id, label, ms: Math.round((now - lapAt) * 10) / 10, metrics });
    lapAt = now;
  };
  const issues: Issue[] = [];
  const err = (check: CheckId, message: string, node?: string) => issues.push({ check, severity: "error", message, node });
  const warn = (check: CheckId, message: string, node?: string) => issues.push({ check, severity: "warning", message, node });
  const secret = opts.secret ?? env().ANSWER_SECRET;

  /* ── ids & references ── */
  uniq(bp.nodes.map((n) => n.id), "node", (m) => err("references", m));
  uniq(bp.rounds.map((r) => r.id), "round", (m) => err("references", m));
  uniq(bp.acts.map((a) => a.id), "act", (m) => err("references", m));
  uniq(bp.evidence.map((e) => e.id), "evidence", (m) => err("references", m));
  uniq(bp.checkpoints.map((c) => c.id), "checkpoint", (m) => err("references", m));
  uniq(bp.story.characters.map((c) => c.id), "character", (m) => err("narrative", m));
  uniq(bp.story.locations.map((c) => c.id), "location", (m) => err("narrative", m));
  const nodeIds = new Set(bp.nodes.map((n) => n.id));
  const evIds = new Set(bp.evidence.map((e) => e.id));
  const cpIds = new Set(bp.checkpoints.map((c) => c.id));
  const charIds = new Set(bp.story.characters.map((c) => c.id));
  const locIds = new Set(bp.story.locations.map((c) => c.id));
  const tlIds = new Set(bp.story.timeline.map((c) => c.id));
  const roundIds = new Set(bp.rounds.map((r) => r.id));
  const actIds = new Set(bp.acts.map((a) => a.id));
  const siteIds = new Set(bp.sites.map((s) => s.id));
  for (const r of bp.rounds) if (!actIds.has(r.act)) err("references", `round "${r.id}" belongs to unknown act "${r.act}"`);
  for (const r of bp.rounds) if (!bp.nodes.some((n) => n.round === r.id)) warn("references", `round "${r.title}" has no challenges`);
  const flagsSet = new Set<string>();
  const phasesSet = new Set<string>([bp.acts[0]?.phase ?? "briefing"]);
  for (const n of bp.nodes) {
    for (const k of Object.keys(n.rewards.flags)) flagsSet.add(k);
    if (n.rewards.phase) phasesSet.add(n.rewards.phase);
    if (n.primitive === "interview") {
      const c = n.config as { topics?: { reveals?: { flags?: Record<string, unknown> } }[]; confrontations?: { reveals?: { flags?: Record<string, unknown> } }[] };
      for (const x of [...(c.topics ?? []), ...(c.confrontations ?? [])]) for (const k of Object.keys(x.reveals?.flags ?? {})) flagsSet.add(k);
    }
  }
  const producers = evidenceProducers(bp);
  for (const n of bp.nodes) {
    if (!roundIds.has(n.round)) err("references", `unknown round "${n.round}"`, n.id);
    const r = gateRefs(n.gate);
    for (const x of r.nodes) if (!nodeIds.has(x)) err("dependencies", `gate requires unknown node "${x}"`, n.id);
    for (const x of r.evidence) {
      if (!evIds.has(x)) err("dependencies", `gate requires unknown evidence "${x}"`, n.id);
      else if (!producers.has(x) && !bp.evidence.find((e) => e.id === x)?.gate) err("dependencies", `gate requires evidence "${x}" that nothing ever grants`, n.id);
    }
    for (const x of r.checkpoints) if (!cpIds.has(x)) err("dependencies", `gate requires unknown checkpoint "${x}"`, n.id);
    for (const f of r.flags) if (!flagsSet.has(f)) err("dependencies", `gate requires flag "${f}" that no node ever sets`, n.id);
    for (const p of r.phases) if (!phasesSet.has(p)) err("dependencies", `gate requires narrative phase "${p}" that is never entered`, n.id);
    if (hardNodeDeps(n.gate).has(n.id)) err("dependencies", "a node cannot require itself", n.id);
    for (const e of n.rewards.evidence) if (!evIds.has(e)) err("references", `rewards unknown evidence "${e}"`, n.id);
    for (const t of n.rewards.timeline) if (!tlIds.has(t)) err("references", `rewards unknown timeline entry "${t}"`, n.id);
    for (const l of n.rewards.locations) if (!locIds.has(l)) err("references", `rewards unknown location "${l}"`, n.id);
    if (n.redHerring && !bp.redHerrings.some((h) => h.id === n.redHerring)) err("red-herrings", `unknown red herring "${n.redHerring}"`, n.id);
    const p = getPrimitive(n.primitive);
    if (!p) {
      err("schema", `unknown primitive "${n.primitive}"`, n.id);
      continue;
    }
    const parsed = p.schema.safeParse(n.config);
    if (!parsed.success) for (const i of parsed.error.issues.slice(0, 4)) err("schema", `config.${i.path.join(".")}: ${i.message}`, n.id);
    for (const t of templateErrors({ config: n.config, briefing: n.briefing, hints: n.hints.map((h) => h.text) })) err("schema", `template ${t.path}: ${t.message}`, n.id);
    const site = (n.config as { site?: string }).site;
    if (site && p.site && !siteIds.has(site)) err("references", `site "${site}" is not defined in sites[]`, n.id);
    const cp = (n.config as { checkpoint?: string }).checkpoint;
    if ((n.primitive === "qr-checkpoint" || n.primitive === "gps-checkpoint") && cp) {
      const c = bp.checkpoints.find((x) => x.id === cp);
      if (!c) err("checkpoints", `checkpoint "${cp}" does not exist`, n.id);
      else if (n.primitive === "gps-checkpoint" && !c.geo) err("checkpoints", `checkpoint "${cp}" has no geo coordinates`, n.id);
      else if (n.primitive === "qr-checkpoint" && c.kind !== "qr") warn("checkpoints", `checkpoint "${cp}" is not a QR checkpoint`, n.id);
    }
    if (n.primitive === "interview") {
      const c = n.config as { suspect?: string };
      if (c.suspect && !charIds.has(c.suspect)) err("narrative", `interview suspect "${c.suspect}" is not a character`, n.id);
    }
  }
  for (const e of bp.evidence) {
    for (const c of e.about.characters) if (!charIds.has(c)) err("narrative", `evidence "${e.id}" mentions unknown character "${c}"`);
    for (const l of e.about.locations) if (!locIds.has(l)) err("narrative", `evidence "${e.id}" mentions unknown location "${l}"`);
    const r = gateRefs(e.gate);
    for (const x of r.nodes) if (!nodeIds.has(x)) err("references", `evidence "${e.id}" gate references unknown node "${x}"`);
  }
  for (const c of bp.story.characters) for (const r of c.relationships) if (!charIds.has(r.to)) warn("narrative", `${c.name}: relationship to unknown character "${r.to}"`);
  for (const t of bp.story.timeline) {
    for (const a of t.actors) if (!charIds.has(a)) warn("narrative", `timeline "${t.id}" names unknown actor "${a}"`);
    if (t.location && !locIds.has(t.location)) warn("narrative", `timeline "${t.id}" names unknown location "${t.location}"`);
  }
  if (bp.story.truth.culprit && !charIds.has(bp.story.truth.culprit)) err("narrative", `story truth names unknown culprit "${bp.story.truth.culprit}"`);
  const idKinds: Record<string, Set<string>> = { ev: evIds, sus: charIds, loc: locIds, tl: tlIds };
  for (const r of bp.relations) for (const end of [r.from, r.to]) {
    const [k, id] = end.split(":") as [string, string];
    if (!idKinds[k]?.has(id)) err("narrative", `relation ${r.from} —${r.kind}→ ${r.to}: unknown "${end}"`);
  }
  for (const h of bp.redHerrings) {
    for (const d of h.disprovedBy) if (!evIds.has(d)) err("red-herrings", `red herring "${h.id}" is disproved by unknown evidence "${d}"`);
    if (h.plausibility < 0.2) warn("red-herrings", `red herring "${h.id}" is barely plausible (${h.plausibility}); players may ignore it`);
  }
  for (const cp of bp.checkpoints) {
    if (cp.kind === "gps" && !cp.geo) err("checkpoints", `GPS checkpoint "${cp.id}" has no coordinates`);
    if (cp.requiresApproval && !cp.pin) warn("checkpoints", `checkpoint "${cp.id}" requires approval but has no station PIN (volunteers must sign in with staff accounts)`);
    const tk = signToken(env().TOKEN_SECRET, "checkpoint", { e: bp.event.id, c: cp.id, k: 1 });
    const back = verifyToken<{ c: string }>(env().TOKEN_SECRET, "checkpoint", tk);
    if (back?.c !== cp.id) err("qr-tokens", `QR token for "${cp.id}" does not verify`);
    if (verifyToken(env().TOKEN_SECRET, "badge", tk)) err("qr-tokens", `QR token for "${cp.id}" verifies under the wrong purpose`);
  }
  if (!bp.nodes.some((n) => n.primitive === "final-reconstruction")) warn("references", "no final-reconstruction node: the event has no closing accusation");

  /* ── scoring & hints ── */
  for (const n of bp.nodes) {
    if (n.scoring.dynamic && n.scoring.dynamic.minimum > n.scoring.points) err("scoring", "dynamic minimum exceeds initial points", n.id);
    if (n.primitive === "final-reconstruction") {
      const f = (n.config as { fields?: { points: number }[] }).fields ?? [];
      if (f.reduce((s, x) => s + x.points, 0) <= 0) err("scoring", "final reconstruction awards no points", n.id);
    }
    const explicitAt = n.hints.findIndex((h) => h.level === "explicit");
    if (explicitAt >= 0 && explicitAt !== n.hints.length - 1) err("hints", "an explicit-answer hint must be the last hint", n.id);
    n.hints.forEach((h, i) => {
      if (hintCost(bp, h) < 0) err("hints", `hint ${i + 1} has a negative cost`, n.id);
      if (i > 0 && hintCost(bp, h) < hintCost(bp, n.hints[i - 1]!) && h.level !== "nudge") warn("hints", `hint ${i + 1} is cheaper than the hint before it`, n.id);
    });
  }

  /* ── fact flow ── */
  const fg = factGraph(bp);
  if (fg.cycle) err("dependencies", `fact-flow cycle between: ${fg.cycle.join(", ")}`);
  for (const [n, refs] of fg.missing) err("dependencies", `uses unknown fact(s): ${refs.join(", ")}`, n);
  const worldKeys = new Set(Object.keys(bp.world.facts));
  for (const n of bp.nodes) for (const alias of Object.keys(n.exports)) {
    if (worldKeys.has(alias)) err("dependencies", `export "${alias}" shadows a world fact`, n.id);
    if (bp.nodes.some((m) => m.id !== n.id && alias in m.exports)) err("dependencies", `export "${alias}" is defined by more than one node`, n.id);
  }
  const analysis = analyzeBlueprint(bp);
  // A node whose fact producer can only be reached *through* the node itself is impossible.
  for (const n of bp.nodes) for (const d of analysis.nodes.get(n.id)!.factDeps) {
    const reach = new Set<string>();
    const walk = (x: string) => {
      for (const y of analysis.nodes.get(x)?.deps ?? []) if (!reach.has(y)) {
        reach.add(y);
        walk(y);
      }
    };
    walk(d);
    if (reach.has(n.id)) err("dependencies", `needs a fact from "${d}", which itself requires this node`, n.id);
  }

  lap("structure", "Structure & references", [
    { label: "files", value: bp.nodes.length },
    { label: "gates", value: analysis.edges.length },
  ]);
  const structural = issues.some((i) => i.severity === "error" && (i.check === "schema" || i.check === "references" || i.check === "dependencies"));
  const quality: NodeQuality[] = [];
  let solvedInPlaythrough = 0;
  if (!structural) {
    /* ── instances, seeds, playthrough, leakage, solvers ── */
    const samples = Math.max(2, opts.samples ?? 3);
    const worlds: TeamWorld[] = [];
    for (let i = 0; i < samples; i++) worlds.push(await buildWorld(bp, { secret, eventId: bp.event.id, teamId: `sample-${i + 1}` }));
    const again = await buildWorld(bp, { secret, eventId: bp.event.id, teamId: "sample-1" });
    for (const [id, msg] of worlds[0]!.errors) err("intended-solution", `instance generation failed: ${msg}`, id);
    for (const [id, ni] of worlds[0]!.nodes) {
      if (JSON.stringify(ni.instance.outputs) !== JSON.stringify(again.nodes.get(id)?.instance.outputs)) err("seeds", "instance generation is not deterministic for the same team", id);
      const answers = worlds.map((w) => w.nodes.get(id)?.instance.outputs.answer).filter((x): x is string => Boolean(x));
      const an = analysis.nodes.get(id)!;
      if (answers.length === samples && new Set(answers).size === 1 && an.perTeam) warn("seeds", "declared per-team, but every sample team got the same answer", id);
      if (ni.node.primitive === "static-answer") warn("seeds", "static answer: identical for every team (shareable)", id);
    }
    lap("instances", "Generate team worlds", [{ label: "sample teams", value: samples }]);
    // Plaintext static answers (before hashing) join the leak scan.
    if (opts.plaintext) for (const w of worlds) for (const [id, answers] of opts.plaintext) {
      const ni = w.nodes.get(id);
      if (ni) ni.instance.guarded = [...new Set([...ni.instance.guarded, ...answers])];
    }

    for (const w of worlds) {
      const p = await playthrough(bp, w);
      if (w === worlds[0]) solvedInPlaythrough = p.solvedOrder.length;
      for (const id of p.unlockedNever) if (w === worlds[0]) err("reachable", "never unlocks, even with perfect play", id);
      for (const s of p.stuck) if (w === worlds[0]) err(s.reason.startsWith("intended action") ? "state-transitions" : "intended-solution", s.reason, s.node);
      if (w === worlds[0])
        for (const h of bp.redHerrings) {
          const reachable = h.disprovedBy.some((d) => p.state.evidence[d]);
          if (!reachable) err("red-herrings", `red herring "${h.id}" can never be disproved: none of ${h.disprovedBy.join(", ")} is obtainable`);
        }
    }

    lap("playthrough", "Play sample teams through", [{ label: "solved", value: `${solvedInPlaythrough}/${bp.nodes.length}` }]);
    // Dead ends: something a team can fail permanently that the finale depends on.
    const finals = bp.nodes.filter((n) => n.primitive === "final-reconstruction").map((n) => n.id);
    const upstream = new Set<string>();
    const up = (x: string) => {
      for (const d of analysis.nodes.get(x)?.deps ?? []) if (!upstream.has(d)) {
        upstream.add(d);
        up(d);
      }
    };
    finals.forEach(up);
    for (const n of bp.nodes) if (n.maxAttempts && upstream.has(n.id)) warn("dead-ends", `limited to ${n.maxAttempts} attempts but the finale depends on it: exhausting them ends the team's run`, n.id);
    for (const n of bp.nodes) if (n.redHerring && !n.optional && upstream.has(n.id)) err("dead-ends", "a red-herring branch is required to reach the finale", n.id);

    // Leakage (first two sample worlds).
    for (const w of worlds.slice(0, 2)) {
      const leaks = scanLeaks(w, staticPayloads(bp, w));
      for (const l of leaks) {
        const check: CheckId = /bundle|source map/.test(l.where) ? "static-js" : "answer-leakage";
        const msg = `answer exposed (${l.encoding}) in ${l.where}`;
        if (issues.some((i) => i.node === l.node && i.message === msg)) continue;
        if (l.crossNode) warn(check, msg, l.node);
        else err(check, msg, l.node);
      }
    }
    // Hints must not contain the answer unless they are answer-level hints.
    for (const [id, ni] of worlds[0]!.nodes) {
      const ans = ni.instance.outputs.answer;
      if (!ans || ans.length < 4) continue;
      ni.node.hints.forEach((h, i) => {
        if (h.level === "explicit" || h.level === "partial-answer") return;
        const text = renderText(h.text, worlds[0]!.facts).toLowerCase();
        if (variants(ans).some((v) => text.includes(v.value.toLowerCase()))) err("hints", `hint ${i + 1} (${h.level}) reveals the answer`, id);
      });
    }

    lap("leakage", "Scan for leaked answers", [{ label: "worlds scanned", value: Math.min(2, samples) }]);
    // Synthetic solvers → quality table.
    for (const [id, ni] of worlds[0]!.nodes) {
      const an = analysis.nodes.get(id)!;
      const solvers: SolverReport = { text: textSolver(ni, worlds[0]!), browser: browserSolver(ni, worlds[0]!, bp), forensic: await forensicSolver(ni) };
      if (solvers.browser.answerExposed) err("answer-leakage", "a site crawler finds the assembled answer without any investigation", id);
      if (solvers.forensic.solved) warn("answer-leakage", `${solvers.forensic.how} — consider moving the clue deeper`, id);
      const tier = bp.rounds.find((r) => r.id === ni.node.round)?.tier ?? "intermediate";
      if (solvers.text.solved && TIERS.indexOf(tier) >= TIERS.indexOf("advanced")) warn("difficulty", `text-only solver cracks it (${solvers.text.how}) in a ${tier} round`, id);
      quality.push({
        id,
        title: ni.node.title,
        primitive: ni.node.primitive,
        depth: an.dependencyDepth,
        score: an.score,
        perTeam: an.perTeam,
        textOnly: textOnlySolvability(an.interaction, an.profile, solvers.text.solved),
        solvers,
      });
    }
  }

  if (!structural) lap("solvers", "Run the synthetic solvers", [{ label: "files graded", value: quality.length }]);
  /* ── duration, curve, duplicates ── */
  const dur = bp.event.durationMinutes;
  if (analysis.criticalMinutes > dur) warn("duration", `critical path is ~${analysis.criticalMinutes} min but the event lasts ${dur} min`);
  if (analysis.totalMinutes < dur * 0.4) warn("duration", `only ~${analysis.totalMinutes} min of required content for a ${dur}-min event`);
  for (const r of bp.rounds) {
    const depths = bp.nodes.filter((n) => n.round === r.id).map((n) => analysis.nodes.get(n.id)!.dependencyDepth);
    const max = Math.max(0, ...depths);
    if ((r.tier === "advanced" || r.tier === "expert" || r.tier === "nightmare") && max < 3) warn("difficulty", `${r.tier} round "${r.title}" has no chain deeper than ${max} hop(s) (aim for 3–7)`);
  }
  for (const r of bp.rounds) {
    const prims = bp.nodes.filter((n) => n.round === r.id).map((n) => n.primitive);
    for (let i = 2; i < prims.length; i++) if (prims[i] === prims[i - 1] && prims[i] === prims[i - 2] && prims[i] !== "static-answer") warn("duplicates", `round "${r.title}" uses "${prims[i]}" three times in a row`);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  lap("rules", "Check duration & curve", [{ label: "critical path", value: `${analysis.criticalMinutes} min` }]);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks: CHECKS.map((c) => {
      const e = errors.filter((i) => i.check === c.id).length;
      const w = warnings.filter((i) => i.check === c.id).length;
      return { ...c, status: e ? "fail" : w ? "warn" : "pass", count: e + w };
    }),
    quality,
    stats: { nodes: bp.nodes.length, maxDepth: analysis.maxDepth, criticalMinutes: analysis.criticalMinutes, totalMinutes: analysis.totalMinutes, durationMinutes: dur, solvedInPlaythrough },
  };
}
