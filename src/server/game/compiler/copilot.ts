import type { BlueprintT, FamilyId } from "../core/blueprint";
import { TIERS, type Tier } from "../core/difficulty";
import { analyzeBlueprint } from "./analysis";
import { hardenNode, hardenRound, type Change } from "./harder";
import { regenerateRound } from "./planner";
import { slug } from "./story";

/**
 * Authoring copilot. It turns an organiser's request into a *proposal*: a list
 * of schema-level operations on the blueprint plus a preview and a diff. It
 * never edits source code and never applies anything by itself — Studio shows
 * the proposal and the organiser accepts or discards it. The proposal is
 * validated like any other draft before publish.
 */

export interface Proposal {
  understood: string;
  target: { kind: "event" | "round" | "node"; id: string | null; title: string };
  plan: string[];
  changes: Change[];
  before: Stats;
  after: Stats;
  preview: BlueprintT;
  added: string[];
  removed: string[];
}

interface Stats {
  nodes: number;
  maxDepth: number;
  redHerrings: number;
  perTeam: number;
  minutes: number;
  families: string[];
}

function stats(bp: BlueprintT, roundId?: string): Stats {
  const a = analyzeBlueprint(bp);
  const nodes = bp.nodes.filter((n) => !roundId || n.round === roundId);
  return {
    nodes: nodes.length,
    maxDepth: Math.max(0, ...nodes.map((n) => a.nodes.get(n.id)!.dependencyDepth)),
    redHerrings: nodes.filter((n) => n.redHerring).length + nodes.reduce((s, n) => s + (((n.config as { decoys?: number }).decoys ?? 0) > 0 ? 1 : 0), 0),
    perTeam: nodes.filter((n) => a.nodes.get(n.id)!.perTeam).length,
    minutes: nodes.reduce((s, n) => s + n.estimatedMinutes, 0),
    families: [...new Set(nodes.map((n) => bp.rounds.find((r) => r.id === n.round)?.family ?? ""))],
  };
}

const THEMES: { re: RegExp; families: FamilyId[]; label: string }[] = [
  { re: /\b(cyber|cybercrime|hack(er|ing)?|intrusion|breach|devtools|browser|web)\b/i, families: ["browser", "ctf"], label: "cybercrime investigation (browser + network + storage + forensic artifact)" },
  { re: /\b(forensic|evidence files?|artifacts?|photo|audio|pdf)\b/i, families: ["forensics"], label: "digital forensics" },
  { re: /\b(osint|social|online trail|public trail)\b/i, families: ["osint"], label: "OSINT trail" },
  { re: /\b(interrogat|interview|detective|inquest|murder|mystery)\b/i, families: ["inquest"], label: "detective inquest" },
  { re: /\b(cipher|puzzle|cryptic)\b/i, families: ["cryptic"], label: "cryptic puzzles" },
  { re: /\b(physical|campus|field|checkpoint|qr|gps)\b/i, families: ["physical"], label: "physical hunt" },
];

function findTarget(bp: BlueprintT, prompt: string): Proposal["target"] {
  const rn = /\bround\s*(\d+)\b/i.exec(prompt);
  if (rn) {
    const r = bp.rounds[Number(rn[1]) - 1];
    if (r) return { kind: "round", id: r.id, title: r.title };
  }
  const an = /\bact\s*(\d+|[ivx]+)\b/i.exec(prompt);
  if (an) {
    const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
    const idx = /\d/.test(an[1]!) ? Number(an[1]) : (roman[an[1]!.toLowerCase()] ?? 0);
    const act = bp.acts[idx - 1];
    const r = act ? bp.rounds.find((x) => x.act === act.id) : undefined;
    if (r) return { kind: "round", id: r.id, title: r.title };
  }
  const lower = prompt.toLowerCase();
  const node = bp.nodes.find((n) => lower.includes(n.title.toLowerCase()) || lower.includes(n.id));
  if (node) return { kind: "node", id: node.id, title: node.title };
  const round = bp.rounds.find((r) => lower.includes(r.title.toLowerCase()));
  if (round) return { kind: "round", id: round.id, title: round.title };
  return { kind: "event", id: null, title: bp.event.title };
}

export function propose(bp: BlueprintT, prompt: string): Proposal {
  const target = findTarget(bp, prompt);
  const roundId = target.kind === "round" ? target.id! : target.kind === "node" ? bp.nodes.find((n) => n.id === target.id)!.round : undefined;
  const before = stats(bp, roundId);
  let preview = bp;
  const plan: string[] = [];
  const changes: Change[] = [];
  let added: string[] = [];
  let removed: string[] = [];

  const theme = THEMES.find((t) => t.re.test(prompt));
  const harder = /\b(harder|tougher|difficult|challenging|nightmare|brutal|deeper)\b/i.test(prompt);
  const easier = /\b(easier|gentler|simpler|shorter|beginner)\b/i.test(prompt);
  const herring = /\bred[- ]?herrings?\b|\bdecoys?\b|\bmisdirect/i.test(prompt);

  if (theme && roundId) {
    const r = regenerateRound(preview, roundId, theme.families, { budget: 3 });
    preview = r.blueprint;
    added = r.added;
    removed = r.removed;
    plan.push(`Replace ${removed.length} file(s) in "${target.title}" with a ${theme.label}`);
    const prims = [...new Set(added.map((id) => preview.nodes.find((n) => n.id === id)!.primitive))];
    plan.push(`add: ${prims.join(" + ")}`);
    changes.push({ node: roundId, kind: "structure", summary: `Regenerated round as ${theme.label}`, before: removed, after: added });
  } else if (theme && !roundId) {
    // Event-level theme: append a new round of that family before the final.
    const fam = theme.families[0]!;
    const finalRound = preview.rounds.find((r) => r.family === "final");
    const out = structuredClone(preview);
    const id = `r-${fam}-${slug(prompt).slice(0, 12)}`.slice(0, 40);
    const act = finalRound?.act ?? out.acts.at(-1)!.id;
    const tier: Tier = "advanced";
    out.rounds.splice(finalRound ? out.rounds.indexOf(finalRound) : out.rounds.length, 0, { id, act, title: theme.label.split(" (")[0]!.replace(/^./, (c) => c.toUpperCase()), family: fam, tier, intro: "" });
    // Seed the round with a placeholder so regeneration has a gate to inherit.
    const lastKey = out.nodes.filter((n) => !n.optional && n.primitive !== "final-reconstruction").at(-1);
    out.nodes.push({ ...structuredClone(out.nodes[0]!), id: `${id}-seed`, round: id, gate: lastKey ? { node: lastKey.id } : undefined, exports: {}, optional: true });
    const r = regenerateRound(out, id, theme.families, { tier, budget: 3 });
    preview = r.blueprint;
    added = r.added;
    plan.push(`Add a new "${theme.label}" round before the final`, `add: ${[...new Set(added.map((a) => preview.nodes.find((n) => n.id === a)!.primitive))].join(" + ")}`);
  }

  if (harder || (theme && /\b(feel|serious|real)\b/i.test(prompt))) {
    const h = target.kind === "node" ? hardenNode(preview, target.id!) : roundId ? hardenRound(preview, roundId) : null;
    if (h) {
      preview = h.blueprint;
      changes.push(...h.changes);
      plan.push(`Make it harder: difficulty ${h.scoreBefore} → ${h.scoreAfter}, dependency depth ${h.depthBefore} → ${h.depthAfter}`);
    } else if (!roundId) {
      const out = structuredClone(preview);
      for (const r of out.rounds) {
        const i = TIERS.indexOf(r.tier);
        if (r.tier !== "final" && i < TIERS.indexOf("nightmare")) r.tier = TIERS[i + 1]!;
      }
      out.difficulty.curve = "aggressive";
      preview = out;
      plan.push("Shift every round one tier up the curve (curve → aggressive)");
    }
  }

  if (easier) {
    const out = structuredClone(preview);
    for (const n of out.nodes.filter((x) => !roundId || x.round === roundId)) {
      if (!n.hints.some((h) => h.level === "nudge")) n.hints.unshift({ level: "nudge", text: "Start with the most obvious artifact and read it end to end.", cost: 0 });
      n.estimatedMinutes = Math.max(5, Math.round(n.estimatedMinutes * 0.8));
    }
    for (const r of out.rounds.filter((x) => !roundId || x.id === roundId)) {
      const i = TIERS.indexOf(r.tier);
      if (r.tier !== "final" && i > 0) r.tier = TIERS[i - 1]!;
    }
    preview = out;
    plan.push("Add free nudges, shorten estimates and move one tier down the curve");
  }

  if (herring) {
    const out = structuredClone(preview);
    const decoy = out.story.characters.find((c) => c.suspect && c.id !== out.story.truth.culprit);
    const place = out.nodes.find((n) => (!roundId || n.round === roundId) && n.primitive !== "final-reconstruction");
    if (decoy && place) {
      const evId = `ev-alibi-${decoy.id}`.slice(0, 63);
      if (!out.evidence.some((e) => e.id === evId)) out.evidence.push({ id: evId, title: `${decoy.name}'s alibi`, kind: "record", summary: "", body: `${decoy.name} was elsewhere.`, about: { characters: [decoy.id], locations: [], timeline: [] } });
      const hid = `herring-${decoy.id}-${out.redHerrings.length + 1}`.slice(0, 63);
      out.redHerrings.push({ id: hid, description: `${decoy.name} was seen near the scene.`, plausibility: 0.75, disprovedBy: [evId], supportedBy: [] });
      out.nodes.push({
        id: `interview-${decoy.id}-${out.nodes.length}`.slice(0, 63),
        round: place.round,
        title: `Interview — ${decoy.name}`,
        primitive: "interview",
        briefing: `${decoy.name} was seen near the scene. Were they involved?`,
        config: {
          suspect: decoy.id,
          name: decoy.name,
          intro: '"I know how it looks."',
          topics: [{ id: "where", question: "Where were you?", answer: "Somewhere else, with witnesses.", kind: "truth", reveals: { evidence: [evId], flags: { [`${decoy.id}-cleared`]: true } } }],
          goal: { contradictions: [], flags: [`${decoy.id}-cleared`] },
        },
        gate: place.gate,
        optional: true,
        redHerring: hid,
        scoring: { points: 60, firstBloodBonus: 0 },
        hints: [],
        rewards: { evidence: [], flags: {}, resources: {}, timeline: [], locations: [] },
        exports: {},
        estimatedMinutes: 6,
        skills: [],
        tools: [],
        tags: [],
      });
      preview = out;
      plan.push(`Add a falsifiable red herring: ${decoy.name} (disproved by their alibi)`);
    }
  }

  if (!plan.length) plan.push("No actionable change recognised. Try: 'make round 3 feel like a cybercrime investigation', 'make the capture harder', 'add a red herring to round 5', 'make act II easier'.");
  const after = stats(preview, roundId);
  return {
    understood: [theme ? `theme: ${theme.label}` : null, harder ? "raise difficulty" : null, easier ? "lower difficulty" : null, herring ? "add red herring" : null].filter(Boolean).join(", ") || "nothing specific",
    target,
    plan: [...plan, `dependency depth = ${after.maxDepth}`, `red herrings = ${after.redHerrings}`, `unique per team = ${after.perTeam}/${after.nodes}`, `estimated duration = ${after.minutes}m`],
    changes,
    before,
    after,
    preview,
    added,
    removed,
  };
}
