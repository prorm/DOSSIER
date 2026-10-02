/**
 * Multidimensional difficulty. Every axis is 0..10. Primitives supply a base
 * profile from their config; the compiler overlays graph-derived axes
 * (dependency depth, red-herring density, instance uniqueness).
 */
export interface DifficultyProfile {
  knowledgeDifficulty: number;
  reasoningDifficulty: number;
  toolRequirement: number;
  interactionDepth: number;
  statefulness: number;
  dependencyDepth: number;
  crossModalComplexity: number;
  redHerringDensity: number;
  instanceUniqueness: number;
  physicalDependency: number;
}

export const DIFFICULTY_AXES: { key: keyof DifficultyProfile; label: string; short: string }[] = [
  { key: "knowledgeDifficulty", label: "Knowledge", short: "KNW" },
  { key: "reasoningDifficulty", label: "Reasoning", short: "RSN" },
  { key: "toolRequirement", label: "Tooling", short: "TOOL" },
  { key: "interactionDepth", label: "Interaction", short: "INT" },
  { key: "statefulness", label: "Statefulness", short: "STATE" },
  { key: "dependencyDepth", label: "Dependency depth", short: "DEP" },
  { key: "crossModalComplexity", label: "Cross-modal", short: "XMOD" },
  { key: "redHerringDensity", label: "Red herrings", short: "RH" },
  { key: "instanceUniqueness", label: "Per-team uniqueness", short: "UNIQ" },
  { key: "physicalDependency", label: "Physical", short: "PHYS" },
];

export const TIERS = ["intro", "beginner", "intermediate", "advanced", "expert", "nightmare", "final"] as const;
export type Tier = (typeof TIERS)[number];

export const CURVES = ["gentle", "standard", "aggressive", "nightmare", "custom"] as const;
export type Curve = (typeof CURVES)[number];

export function profile(p: Partial<DifficultyProfile>): DifficultyProfile {
  const clamp = (v: number | undefined) => Math.max(0, Math.min(10, Math.round((v ?? 0) * 10) / 10));
  return {
    knowledgeDifficulty: clamp(p.knowledgeDifficulty),
    reasoningDifficulty: clamp(p.reasoningDifficulty),
    toolRequirement: clamp(p.toolRequirement),
    interactionDepth: clamp(p.interactionDepth),
    statefulness: clamp(p.statefulness),
    dependencyDepth: clamp(p.dependencyDepth),
    crossModalComplexity: clamp(p.crossModalComplexity),
    redHerringDensity: clamp(p.redHerringDensity),
    instanceUniqueness: clamp(p.instanceUniqueness),
    physicalDependency: clamp(p.physicalDependency),
  };
}

/** Weighted single number (0..100) for sorting and curve fitting. Never shown as "the" difficulty. */
export function difficultyScore(p: DifficultyProfile): number {
  const w: Record<keyof DifficultyProfile, number> = {
    knowledgeDifficulty: 1.0,
    reasoningDifficulty: 1.4,
    toolRequirement: 1.1,
    interactionDepth: 1.0,
    statefulness: 0.8,
    dependencyDepth: 1.3,
    crossModalComplexity: 1.0,
    redHerringDensity: 0.7,
    instanceUniqueness: 0.3,
    physicalDependency: 0.4,
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const sum = (Object.keys(w) as (keyof DifficultyProfile)[]).reduce((acc, k) => acc + p[k] * w[k], 0);
  return Math.round((sum / (total * 10)) * 100);
}

/** Map a round index (0..n-1) onto a tier for a curve preset. The last round is always "final". */
export function tierFor(curve: Curve, index: number, count: number, custom?: Tier[]): Tier {
  if (curve === "custom" && custom?.[index]) return custom[index]!;
  if (index === count - 1 && count > 1) return "final";
  const x = count <= 2 ? 0 : index / (count - 2); // 0..1 across non-final rounds
  const ramps: Record<Exclude<Curve, "custom">, Tier[]> = {
    gentle: ["intro", "beginner", "beginner", "intermediate", "intermediate", "advanced"],
    standard: ["intro", "beginner", "intermediate", "intermediate", "advanced", "expert"],
    aggressive: ["beginner", "intermediate", "advanced", "advanced", "expert", "nightmare"],
    nightmare: ["intermediate", "advanced", "expert", "expert", "nightmare", "nightmare"],
  };
  const ramp = ramps[curve === "custom" ? "standard" : curve];
  return ramp[Math.min(ramp.length - 1, Math.round(x * (ramp.length - 1)))]!;
}

/** What a tier asks of the planner. These are *structural* levers, never "longer strings". */
export interface TierTargets {
  depth: number;
  artifacts: number;
  redHerrings: number;
  directClues: "explicit" | "partial" | "oblique";
  crossRound: boolean;
  statefulSteps: number;
  hintCostMultiplier: number;
  minutes: number;
}

export const TIER_TARGETS: Record<Tier, TierTargets> = {
  intro: { depth: 1, artifacts: 0, redHerrings: 0, directClues: "explicit", crossRound: false, statefulSteps: 1, hintCostMultiplier: 0.5, minutes: 8 },
  beginner: { depth: 2, artifacts: 1, redHerrings: 0, directClues: "explicit", crossRound: false, statefulSteps: 2, hintCostMultiplier: 0.75, minutes: 12 },
  intermediate: { depth: 3, artifacts: 1, redHerrings: 1, directClues: "partial", crossRound: true, statefulSteps: 2, hintCostMultiplier: 1, minutes: 16 },
  advanced: { depth: 4, artifacts: 2, redHerrings: 1, directClues: "partial", crossRound: true, statefulSteps: 3, hintCostMultiplier: 1.25, minutes: 22 },
  expert: { depth: 5, artifacts: 2, redHerrings: 2, directClues: "oblique", crossRound: true, statefulSteps: 3, hintCostMultiplier: 1.5, minutes: 28 },
  nightmare: { depth: 6, artifacts: 3, redHerrings: 3, directClues: "oblique", crossRound: true, statefulSteps: 4, hintCostMultiplier: 2, minutes: 35 },
  final: { depth: 7, artifacts: 0, redHerrings: 2, directClues: "oblique", crossRound: true, statefulSteps: 1, hintCostMultiplier: 2, minutes: 25 },
};

export interface InteractionProfile {
  /** Where the information needed to solve lives. */
  channels: ("text" | "browser" | "network" | "storage" | "file" | "binary" | "audio" | "image" | "terminal" | "database" | "physical" | "dialogue" | "state")[];
  /** Portion of the solution recoverable from the node text alone (0..1). */
  textExposure: number;
}

/**
 * Internal heuristic: how far a text-only solver (e.g. an LLM reading the
 * challenge text) could get. This is an *estimate for event-quality testing*,
 * not a claim that a challenge is "AI-proof".
 */
export function textOnlySolvability(ip: InteractionProfile, p: DifficultyProfile, solverHit: boolean): number {
  if (solverHit) return 0.95;
  const nonText = ip.channels.filter((c) => c !== "text").length;
  let v = ip.textExposure;
  v *= 1 - Math.min(0.8, nonText * 0.18);
  v *= 1 - Math.min(0.5, p.dependencyDepth * 0.06);
  v *= 1 - Math.min(0.4, p.instanceUniqueness * 0.04);
  v *= 1 - Math.min(0.6, p.physicalDependency * 0.1);
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}
