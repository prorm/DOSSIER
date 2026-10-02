import { and, desc, eq, not } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../db/client";
import { challenges, events, participants, teams } from "../db/schema";
import { audit, type Actor } from "../audit";
import { hashPassword, randomToken } from "../security/crypto";
import { GameError } from "../engine/errors";
import type { EventRow } from "../engine/types";
import { controlEvent } from "../engine/event";
import { presentationOf } from "../views";
import { recomputeLeaderboard } from "../engine/leaderboard";
import { derivePipeline, type BuildStage, type BuildTrace, type Metric } from "../../lib/experience/pipeline";
import { Blueprint, EventMeta, FAMILIES, Node, Presentation, Story, type BlueprintT, type FamilyId, type PresentationT } from "./core/blueprint";
import { CURVES, TIERS, type Curve, type Tier } from "./core/difficulty";
import { GateSchema } from "./core/gates";
import { prepareBlueprint, publishBlueprint, saveStorySources } from "./compile";
import { analyzeBlueprint } from "./compiler/analysis";
import { propose, type Proposal } from "./compiler/copilot";
import { hardenNode, hardenRound, type HardenResult } from "./compiler/harder";
import { mapConcepts, type MechanicSuggestion } from "./compiler/mapper";
import { planEvent } from "./compiler/planner";
import { compileStory, slug, type ExtractedStory, type StorySource } from "./compiler/story";
import { validateBlueprint, type CheckId, type ValidationPhase, type ValidationReport } from "./compiler/validate";
import { getPrimitive, primitiveCatalog } from "./primitives/registry";

/**
 * DOSSIER Studio (server side). Organisers never edit YAML: every step reads
 * and writes a *draft* (events.draft) through validated operations. Publishing
 * compiles, validates and materialises the draft; "Play as team" gives the
 * organiser a playtest team inside that event.
 */

export const StudioMeta = z.object({
  title: z.string().trim().min(3).max(100),
  university: z.string().trim().max(120).default(""),
  description: z.string().trim().max(4000).default(""),
  tagline: z.string().trim().max(160).default(""),
  accent: z.enum(["green", "cyan", "magenta", "amber"]).default("cyan"),
  logoText: z.string().trim().max(4).default(""),
  teamMin: z.number().int().min(1).max(12).default(1),
  teamMax: z.number().int().min(1).max(12).default(4),
  mode: z.enum(["online", "hybrid", "onsite"]).default("hybrid"),
  durationMinutes: z.number().int().min(30).max(7 * 24 * 60).default(300),
  startsAt: z.string().datetime({ offset: true }).optional().or(z.literal("").transform(() => undefined)),
  endsAt: z.string().datetime({ offset: true }).optional().or(z.literal("").transform(() => undefined)),
  registrationOpen: z.boolean().default(true),
  registrationCode: z.string().trim().max(64).optional().or(z.literal("").transform(() => undefined)),
  timezone: z.string().max(60).default("Asia/Kolkata"),
});
export type StudioMetaT = z.infer<typeof StudioMeta>;

export interface StudioDraft {
  v: 1;
  meta: StudioMetaT;
  sources: StorySource[];
  extracted: Omit<ExtractedStory, "story"> | null;
  story: z.infer<typeof Story> | null;
  plan: { rounds: FamilyId[]; curve: Curve; customTiers?: Tier[] };
  blueprint: BlueprintT | null;
  notes: string[];
  suggestions: MechanicSuggestion[];
  lastValidation: Pick<ValidationReport, "ok" | "errors" | "warnings" | "checks" | "stats"> & { at: string; quality: ValidationReport["quality"]; /** content revision it was run against */ rev?: number } | null;
  proposal: (Omit<Proposal, "preview"> & { prompt: string }) | null;
  proposalPreview: BlueprintT | null;
  history: { at: string; what: string }[];
  /** How the case looks and opens (cosmetic: never changes a rule, a score or an answer). */
  presentation: PresentationT;
  /** Content revision: bumps whenever the game itself changes. Validation results are tied to it. */
  rev: number;
  /** Any revision, including cosmetic ones. Publishing is tied to it. */
  srev: number;
  /** Receipts of the last generate / validate / publish run: measured stages, real counts. */
  trace: Partial<Record<BuildTrace["kind"], BuildTrace>>;
  published: { rev: number; srev: number; version: number; at: string } | null;
}

const DEFAULT_ROUNDS: FamilyId[] = ["cryptic", "browser", "forensics", "ctf", "inquest", "physical", "final"];

const blankPresentation = (): PresentationT => Presentation.parse(undefined);

function readDraft(e: EventRow): StudioDraft {
  const d = e.draft as unknown as StudioDraft | null;
  // Drafts saved before presentation / traces existed gain sensible defaults.
  if (d && d.v === 1) return { ...d, presentation: d.presentation ?? blankPresentation(), rev: d.rev ?? 0, srev: d.srev ?? 0, trace: d.trace ?? {}, published: d.published ?? null };
  // Opening a pack/published event in Studio: start from its blueprint.
  const bp = e.blueprint ? Blueprint.parse(e.blueprint) : null;
  return {
    v: 1,
    meta: StudioMeta.parse({
      title: bp?.event.title ?? e.name,
      university: bp?.event.university ?? "",
      description: bp?.event.description ?? "",
      tagline: bp?.event.tagline ?? "",
      accent: bp?.event.theme.accent ?? "cyan",
      teamMin: bp?.event.teamSize.min ?? 1,
      teamMax: bp?.event.teamSize.max ?? 4,
      mode: bp?.event.mode ?? "hybrid",
      durationMinutes: bp?.event.durationMinutes ?? 300,
      timezone: bp?.event.timezone ?? "Asia/Kolkata",
    }),
    sources: [],
    extracted: null,
    story: bp?.story ?? null,
    plan: { rounds: bp ? (bp.rounds.map((r) => r.family) as FamilyId[]) : DEFAULT_ROUNDS, curve: bp?.difficulty.curve ?? "standard" },
    blueprint: bp,
    notes: [],
    suggestions: [],
    lastValidation: null,
    proposal: null,
    proposalPreview: null,
    history: [],
    presentation: bp?.event.presentation ?? blankPresentation(),
    rev: 0,
    srev: 0,
    trace: {},
    published: null,
  };
}

/**
 * content  – the game changed (validation no longer describes it)
 * cosmetic – only how it looks changed (publishing is out of date; validation is not)
 * none     – bookkeeping (a validation run, a proposal waiting for a decision)
 */
type Change = "content" | "cosmetic" | "none";

async function writeDraft(db: Executor, eventId: string, d: StudioDraft, what: string, change: Change = "content") {
  if (change === "content") d.rev += 1;
  if (change !== "none") d.srev += 1;
  d.history = [{ at: new Date().toISOString(), what }, ...d.history].slice(0, 30);
  await db.update(events).set({ draft: d as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(events.id, eventId));
}

export async function loadStudioEvent(db: Executor, id: string) {
  const [e] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!e) throw new GameError("not_found", "Event not found.");
  return { event: e, draft: readDraft(e) };
}

function applyMeta(bp: BlueprintT, meta: StudioMetaT, presentation: PresentationT): BlueprintT {
  const out = structuredClone(bp);
  out.event = EventMeta.parse({
    ...out.event,
    presentation,
    title: meta.title,
    university: meta.university,
    organizer: meta.university,
    description: meta.description,
    tagline: meta.tagline || out.event.tagline,
    theme: { accent: meta.accent, secondary: meta.accent === "amber" ? "cyan" : "amber" },
    mode: meta.mode,
    durationMinutes: meta.durationMinutes,
    teamSize: { min: meta.teamMin, max: Math.max(meta.teamMin, meta.teamMax) },
    startsAt: meta.startsAt,
    endsAt: meta.endsAt,
    timezone: meta.timezone,
    registration: { open: meta.registrationOpen, code: meta.registrationCode },
  });
  return out;
}

/* ─────────────────────────── build traces ─────────────────────────── */

/**
 * A trace is a receipt: each stage is timed where it actually runs and carries the
 * real counts it produced. Studio replays these; it never makes up a progress value.
 */
function tracer(kind: BuildTrace["kind"]) {
  const t0 = performance.now();
  let lap = t0;
  const stages: BuildStage[] = [];
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    /** Close the stage that just ran. */
    add(id: string, label: string, status: BuildStage["status"], metrics: Metric[] = [], note?: string) {
      const now = performance.now();
      stages.push({ id, label, status, ms: round(now - lap), metrics, note });
      lap = now;
    },
    push(stage: BuildStage) {
      stages.push(stage);
      lap = performance.now();
    },
    stages,
    done(ok: boolean): BuildTrace {
      return { kind, at: new Date().toISOString(), totalMs: Math.round(performance.now() - t0), stages, ok };
    },
  };
}

const PHASE_ORDER: ValidationPhase["id"][] = ["structure", "instances", "playthrough", "leakage", "solvers", "rules"];
const PHASE_LABEL: Record<ValidationPhase["id"], string> = {
  structure: "Structure & references",
  instances: "Generate team worlds",
  playthrough: "Play sample teams through",
  leakage: "Scan for leaked answers",
  solvers: "Run the synthetic solvers",
  rules: "Check duration & curve",
};
/** Which compiler checks belong to which phase, so each stage can show its own verdict. */
const PHASE_CHECKS: Record<ValidationPhase["id"], CheckId[]> = {
  structure: ["schema", "references", "dependencies", "narrative", "scoring", "checkpoints", "qr-tokens"],
  instances: ["seeds"],
  playthrough: ["reachable", "intended-solution", "state-transitions", "dead-ends", "red-herrings"],
  leakage: ["answer-leakage", "static-js", "hints"],
  solvers: ["difficulty"],
  rules: ["duration", "duplicates"],
};

/** Run the compiler validation and describe it as a trace: one measured stage per phase, red where its checks failed. */
async function runValidation(bp: BlueprintT, plaintext?: Map<string, string[]>): Promise<{ report: ValidationReport; trace: BuildTrace }> {
  const t0 = performance.now();
  const phases = new Map<ValidationPhase["id"], ValidationPhase>();
  const report = await validateBlueprint(bp, { samples: 3, plaintext, onPhase: (p) => void phases.set(p.id, p) });
  const verdict = (id: ValidationPhase["id"]): Pick<BuildStage, "status" | "note"> => {
    const mine = report.checks.filter((c) => PHASE_CHECKS[id].includes(c.id));
    const failed = mine.filter((c) => c.status === "fail");
    const warned = mine.filter((c) => c.status === "warn");
    if (failed.length) {
      const first = report.errors.find((e) => PHASE_CHECKS[id].includes(e.check));
      return { status: "fail", note: first ? (first.node ? `${first.node}: ${first.message}` : first.message) : failed[0]!.label };
    }
    if (warned.length) return { status: "warn", note: `${warned.reduce((n, c) => n + c.count, 0)} warning(s)` };
    return { status: "ok" };
  };
  const stages: BuildStage[] = PHASE_ORDER.map((id) => {
    const p = phases.get(id);
    if (!p) return { id, label: PHASE_LABEL[id], status: "skip", ms: 0, metrics: [], note: "Not run: fix the structural errors first" };
    return { id, label: p.label, ms: p.ms, metrics: p.metrics, ...verdict(id) };
  });
  return { report, trace: { kind: "validate", at: new Date().toISOString(), totalMs: Math.round(performance.now() - t0), stages, ok: report.ok } };
}

const stored = (r: ValidationReport, rev: number): NonNullable<StudioDraft["lastValidation"]> => ({ ok: r.ok, errors: r.errors, warnings: r.warnings, checks: r.checks, stats: r.stats, quality: r.quality, at: new Date().toISOString(), rev });

/* ─────────────────────────── operations ─────────────────────────── */

/** The seven stations as a cheap strip for the events list (no graph analysis: statuses only). */
function lineOf(e: EventRow, d: StudioDraft | null): { id: string; status: string }[] {
  const draft = d ?? readDraft(e);
  const bp = draft.blueprint;
  const lv = draft.lastValidation;
  return derivePipeline({
    hasStory: Boolean(draft.story),
    story: draft.story ? { characters: draft.story.characters.length, suspects: 0, locations: draft.story.locations.length, timeline: draft.story.timeline.length, organisations: 0, artifacts: 0, sources: draft.sources.length } : null,
    blueprint: bp ? { nodes: bp.nodes.length, rounds: bp.rounds.length, acts: bp.acts.length, mechanics: 0, families: 0, evidence: bp.evidence.length, facts: 0, sites: bp.sites.length, checkpoints: bp.checkpoints.length, redHerrings: 0 } : null,
    graph: bp ? { edges: 0, maxDepth: 0, criticalMinutes: 0, totalMinutes: 0, perTeam: 0, textOnlyRisk: 0 } : null,
    presentation: { theme: draft.presentation.theme, intensity: draft.presentation.intensity, hasWording: false },
    validation: lv ? { ok: lv.ok, errors: lv.errors.length, warnings: lv.warnings.length, solved: lv.stats.solvedInPlaythrough, nodes: lv.stats.nodes, stale: lv.rev !== undefined && lv.rev !== draft.rev, at: lv.at } : null,
    published: { version: e.blueprintVersion, active: e.active, at: e.publishedAt?.toISOString() ?? null },
    dirtySincePublish: Boolean(e.blueprintVersion && draft.published && draft.published.srev !== draft.srev),
  }).map((s) => ({ id: s.id, status: s.status }));
}

export async function listStudioEvents(db: Executor) {
  const rows = await db.select().from(events).orderBy(desc(events.updatedAt));
  const counts = await db.select({ eventId: challenges.eventId, id: challenges.id }).from(challenges);
  return rows.map((e) => {
    const d = e.draft as unknown as StudioDraft | null;
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      status: e.status,
      active: e.active,
      version: e.blueprintVersion,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      hasDraft: Boolean(d),
      line: lineOf(e, d),
      draftNodes: d?.blueprint?.nodes.length ?? 0,
      publishedNodes: counts.filter((c) => c.eventId === e.id).length,
      /** The look the event will wear: the draft's choice, else the published one. */
      theme: d?.presentation?.theme ?? presentationOf(e).theme,
      storyTitle: d?.story?.title ?? null,
      updatedAt: e.updatedAt.toISOString(),
    };
  });
}

export async function createStudioEvent(db: Executor, input: z.input<typeof StudioMeta>, actor: Actor) {
  const meta = StudioMeta.parse(input);
  let id = slug(meta.title).slice(0, 50) || "event";
  for (let i = 2; (await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1)).length; i++) id = `${slug(meta.title).slice(0, 46)}-${i}`;
  const draft: StudioDraft = { ...readDraft({ draft: null, blueprint: null, name: meta.title } as unknown as EventRow), meta };
  await db.insert(events).values({ id, name: meta.title, kind: "studio", status: "draft", config: {}, draft: draft as unknown as Record<string, unknown> });
  await audit(db, actor, "studio.create", { eventId: id, target: id, details: { title: meta.title } });
  return { id };
}

export async function saveMeta(db: Executor, id: string, input: z.input<typeof StudioMeta>) {
  const { draft } = await loadStudioEvent(db, id);
  draft.meta = StudioMeta.parse(input);
  if (draft.blueprint) draft.blueprint = applyMeta(draft.blueprint, draft.meta, draft.presentation);
  await db.update(events).set({ name: draft.meta.title }).where(eq(events.id, id));
  await writeDraft(db, id, draft, "Event setup saved");
  return draft;
}

/** How the case looks and opens. Cosmetic: saving it never invalidates a validation run. */
export async function savePresentation(db: Executor, id: string, input: unknown) {
  const { draft } = await loadStudioEvent(db, id);
  draft.presentation = Presentation.parse(input);
  if (draft.blueprint) draft.blueprint = applyMeta(draft.blueprint, draft.meta, draft.presentation);
  await writeDraft(db, id, draft, `Presentation: ${draft.presentation.theme.replace("-", " ")}, ${draft.presentation.intensity}`, "cosmetic");
  return draft;
}

export const StoryImport = z.object({ sources: z.array(z.object({ name: z.string().max(80), markdown: z.string().max(200_000) })).min(1).max(12) });

export async function importStory(db: Executor, id: string, input: z.infer<typeof StoryImport>) {
  const { draft } = await loadStudioEvent(db, id);
  const sources = input.sources.map((s) => ({ name: s.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 80) || "story.md", markdown: s.markdown }));
  const ex = compileStory(sources);
  const { story, ...rest } = ex;
  draft.sources = sources;
  draft.story = story;
  draft.extracted = rest;
  draft.suggestions = mapConcepts(ex);
  await writeDraft(db, id, draft, `Story imported (${sources.length} file${sources.length === 1 ? "" : "s"})`);
  return draft;
}

export async function saveStory(db: Executor, id: string, story: unknown) {
  const { draft } = await loadStudioEvent(db, id);
  draft.story = Story.parse(story);
  await writeDraft(db, id, draft, "Story edited");
  return draft;
}

export const PlanInput = z.object({
  rounds: z.array(z.enum(FAMILIES)).min(1).max(12),
  curve: z.enum(CURVES),
  customTiers: z.array(z.enum(TIERS)).max(12).optional(),
});

export async function savePlan(db: Executor, id: string, input: z.infer<typeof PlanInput>) {
  const { draft } = await loadStudioEvent(db, id);
  draft.plan = PlanInput.parse(input);
  await writeDraft(db, id, draft, "Round plan saved");
  return draft;
}

export async function generate(db: Executor, id: string) {
  const { draft } = await loadStudioEvent(db, id);
  if (!draft.story) throw new GameError("invalid", "Import a story first.");
  const tr = tracer("generate");
  const ex: ExtractedStory = { story: draft.story, ...(draft.extracted ?? { acts: [], dates: [], times: [], relationships: [], potentialClues: [], potentialRedHerrings: [], concepts: [], warnings: [] }) };
  tr.add("story", "Read the story", "ok", [
    { label: "people", value: draft.story.characters.length },
    { label: "places", value: draft.story.locations.length },
    { label: "beats", value: draft.story.timeline.length },
    { label: "sources", value: draft.sources.length },
  ]);
  let plan: ReturnType<typeof planEvent>;
  try {
    plan = planEvent(ex, {
      eventId: id,
      title: draft.meta.title,
      university: draft.meta.university,
      description: draft.meta.description,
      durationMinutes: draft.meta.durationMinutes,
      teamSize: { min: draft.meta.teamMin, max: Math.max(draft.meta.teamMin, draft.meta.teamMax) },
      mode: draft.meta.mode,
      rounds: draft.plan.rounds,
      curve: draft.plan.curve,
      customTiers: draft.plan.customTiers,
      startsAt: draft.meta.startsAt,
      endsAt: draft.meta.endsAt,
      timezone: draft.meta.timezone,
    });
  } catch (e) {
    tr.add("plan", "Plan rounds & build the world", "fail", [], e instanceof Error ? e.message : "The planner failed.");
    draft.trace.generate = tr.done(false);
    await writeDraft(db, id, draft, "Generation failed", "none");
    throw e;
  }
  // Parsing is part of the planner's contract: the stage ends once the blueprint is a valid, complete document.
  const prepared = prepareBlueprint(plan.blueprint);
  const b = prepared.blueprint;
  tr.add("plan", "Plan rounds & build the world", "ok", [
    { label: "rounds", value: b.rounds.length },
    { label: "files", value: b.nodes.length },
    { label: "world facts", value: Object.keys(b.world.facts).length },
    { label: "sites", value: b.sites.length },
    { label: "checkpoints", value: b.checkpoints.length },
    { label: "exhibits", value: b.evidence.length },
  ]);
  // Plaintext answers were hashed while preparing: drafts never hold plaintext secrets either.
  tr.add("seal", "Seal the answers", "ok", [{ label: "static answers hashed", value: prepared.plaintext.size }]);
  draft.blueprint = applyMeta(prepared.blueprint, draft.meta, draft.presentation);
  tr.add("identity", "Stamp the identity", "ok", [{ label: "theme", value: draft.presentation.theme }]);
  const a = analyzeBlueprint(draft.blueprint);
  tr.add("wire", "Wire the graph", "ok", [
    { label: "gates", value: a.edges.length },
    { label: "max depth", value: a.maxDepth },
    { label: "critical path", value: `${a.criticalMinutes} min` },
    { label: "red herrings", value: draft.blueprint.redHerrings.length },
  ]);
  draft.notes = plan.notes;
  draft.suggestions = plan.suggestions;
  draft.lastValidation = null;
  draft.proposal = null;
  draft.proposalPreview = null;
  draft.trace.generate = tr.done(true);
  await writeDraft(db, id, draft, `Generated ${draft.blueprint.nodes.length} challenges (${draft.plan.curve} curve)`);
  return draft;
}

export async function validateDraft(db: Executor, id: string) {
  const { draft } = await loadStudioEvent(db, id);
  if (!draft.blueprint) throw new GameError("invalid", "Generate the event first.");
  const { report: r, trace } = await runValidation(draft.blueprint);
  draft.lastValidation = stored(r, draft.rev);
  draft.trace.validate = trace;
  await writeDraft(db, id, draft, `Validation: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`, "none");
  return draft;
}

export async function harden(db: Executor, id: string, target: { node?: string; round?: string }): Promise<{ draft: StudioDraft; result: HardenResult }> {
  const { draft } = await loadStudioEvent(db, id);
  if (!draft.blueprint) throw new GameError("invalid", "Generate the event first.");
  const result = target.node ? hardenNode(draft.blueprint, target.node) : target.round ? hardenRound(draft.blueprint, target.round) : null;
  if (!result) throw new GameError("invalid", "Choose a challenge or a round.");
  draft.blueprint = result.blueprint;
  draft.lastValidation = null;
  await writeDraft(db, id, draft, `Made ${target.node ?? target.round} harder (${result.changes.length} change(s))`);
  return { draft, result: { ...result, blueprint: undefined as never } };
}

export async function copilot(db: Executor, id: string, prompt: string) {
  const { draft } = await loadStudioEvent(db, id);
  if (!draft.blueprint) throw new GameError("invalid", "Generate the event first.");
  const p = propose(draft.blueprint, prompt.slice(0, 500));
  const { preview, ...rest } = p;
  draft.proposal = { ...rest, prompt };
  draft.proposalPreview = preview;
  await writeDraft(db, id, draft, `Copilot proposal: ${prompt.slice(0, 60)}`, "none");
  return draft;
}

export async function applyProposal(db: Executor, id: string, accept: boolean) {
  const { draft } = await loadStudioEvent(db, id);
  if (!draft.proposalPreview) throw new GameError("invalid", "No pending proposal.");
  if (accept) {
    draft.blueprint = draft.proposalPreview;
    draft.lastValidation = null;
  }
  const what = `${accept ? "Accepted" : "Discarded"} proposal: ${draft.proposal?.prompt.slice(0, 60) ?? ""}`;
  draft.proposal = null;
  draft.proposalPreview = null;
  await writeDraft(db, id, draft, what, accept ? "content" : "none");
  return draft;
}

export const NodeEdit = z.object({
  nodeId: z.string().max(64),
  title: z.string().trim().min(1).max(120).optional(),
  briefing: z.string().max(20_000).optional(),
  points: z.number().int().min(0).max(100_000).optional(),
  estimatedMinutes: z.number().int().min(1).max(600).optional(),
  optional: z.boolean().optional(),
  gate: GateSchema.nullable().optional(),
  hints: z.array(z.object({ level: z.enum(["nudge", "partial", "artifact", "technique", "partial-answer", "explicit"]), cost: z.number().int().min(0).max(10_000).optional(), text: z.string().min(1).max(4000) })).max(8).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  primitive: z.string().max(60).optional(),
  remove: z.boolean().optional(),
});

export async function editNode(db: Executor, id: string, input: z.infer<typeof NodeEdit>) {
  const { draft } = await loadStudioEvent(db, id);
  if (!draft.blueprint) throw new GameError("invalid", "Generate the event first.");
  const bp = structuredClone(draft.blueprint);
  const idx = bp.nodes.findIndex((n) => n.id === input.nodeId);
  if (idx < 0) throw new GameError("not_found", "Challenge not found.");
  if (input.remove) {
    bp.nodes.splice(idx, 1);
  } else {
    const n = bp.nodes[idx]!;
    if (input.primitive && input.primitive !== n.primitive) {
      const p = getPrimitive(input.primitive);
      if (!p) throw new GameError("invalid", `Unknown primitive "${input.primitive}".`);
      n.primitive = input.primitive;
      n.config = input.config ?? p.example();
    } else if (input.config) n.config = input.config;
    const p = getPrimitive(n.primitive)!;
    const parsed = p.schema.safeParse(n.config);
    if (!parsed.success) throw new GameError("invalid", `Config: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    if (input.title !== undefined) n.title = input.title;
    if (input.briefing !== undefined) n.briefing = input.briefing;
    if (input.points !== undefined) n.scoring.points = input.points;
    if (input.estimatedMinutes !== undefined) n.estimatedMinutes = input.estimatedMinutes;
    if (input.optional !== undefined) n.optional = input.optional;
    if (input.gate !== undefined) n.gate = input.gate ?? undefined;
    if (input.hints) n.hints = input.hints;
    bp.nodes[idx] = Node.parse(n);
  }
  draft.blueprint = prepareBlueprint(bp).blueprint;
  draft.lastValidation = null;
  await writeDraft(db, id, draft, `${input.remove ? "Removed" : "Edited"} ${input.nodeId}`);
  return draft;
}

/** Publishes the draft (validation must pass). Does not start or activate the event. */
export async function publishDraft(db: Executor, id: string, actor: Actor, opts: { activate?: boolean } = {}) {
  const { event, draft } = await loadStudioEvent(db, id);
  if (!draft.blueprint) throw new GameError("invalid", "Generate the event first.");
  const tr = tracer("publish");
  const { report, trace: check } = await runValidation(draft.blueprint);
  draft.lastValidation = stored(report, draft.rev);
  draft.trace.validate = check;
  tr.push({
    id: "validate",
    label: "Validate the whole event",
    status: report.ok ? (report.warnings.length ? "warn" : "ok") : "fail",
    ms: check.totalMs,
    metrics: [
      { label: "errors", value: report.errors.length },
      { label: "warnings", value: report.warnings.length },
      { label: "solved by the bot", value: `${report.stats.solvedInPlaythrough}/${report.stats.nodes}` },
    ],
  });
  if (!report.ok) {
    draft.trace.publish = tr.done(false);
    await writeDraft(db, id, draft, "Publish blocked by validation", "none");
    throw new GameError("invalid", `Validation failed: ${report.errors[0]?.message ?? "see the Validate tab"}`, { errors: report.errors.slice(0, 20) });
  }
  const prepared = prepareBlueprint(draft.blueprint);
  tr.add("seal", "Seal the answers", "ok", [{ label: "static answers hashed", value: prepared.plaintext.size }]);
  const r = await publishBlueprint(db, prepared.blueprint, { kind: event.kind, activate: opts.activate });
  tr.add("materialise", "Materialise the event", "ok", [
    { label: "files", value: prepared.blueprint.nodes.length },
    { label: "exhibits", value: prepared.blueprint.evidence.length },
    { label: "version", value: `v${r.version}` },
  ]);
  if (draft.sources.length) await saveStorySources(db, id, draft.sources, prepared.blueprint.story);
  tr.add("story", "File the story sources", "ok", [{ label: "sources", value: draft.sources.length }]);
  await audit(db, actor, "studio.publish", { eventId: id, target: id, details: { version: r.version, nodes: prepared.blueprint.nodes.length } });
  await recomputeLeaderboard(db, id);
  tr.add("standings", "Open the leaderboard", "ok");
  draft.trace.publish = tr.done(true);
  draft.published = { rev: draft.rev, srev: draft.srev, version: r.version, at: new Date().toISOString() };
  await writeDraft(db, id, draft, `Published v${r.version}`, "none");
  return { draft, version: r.version };
}

export async function activateEvent(db: Executor, id: string, actor: Actor) {
  const { event } = await loadStudioEvent(db, id);
  if (!event.blueprint) throw new GameError("invalid", "Publish the event first.");
  await db.update(events).set({ active: false }).where(not(eq(events.id, id)));
  await db.update(events).set({ active: true }).where(eq(events.id, id));
  await audit(db, actor, "studio.activate", { eventId: id, target: id });
}

/** Starts the clock of the live event (what "Start" does in the Control Room), so a published demo can be played at once. */
export async function startEventNow(db: Executor, id: string, actor: Actor) {
  const { event } = await loadStudioEvent(db, id);
  if (!event.blueprint) throw new GameError("invalid", "Publish the event first.");
  if (!event.active) throw new GameError("invalid", "Make the event the live one before starting it.");
  if (event.status === "live") return;
  const updated = await controlEvent(db, event, "start", actor);
  await recomputeLeaderboard(db, updated.id);
}

/** Creates (or reuses) the organiser's playtest team in this event. */
export async function playtestTeam(db: Executor, id: string, staff: { id: string; name: string; email: string }, opts: { reset?: boolean } = {}) {
  const { event } = await loadStudioEvent(db, id);
  if (!event.blueprint) throw new GameError("invalid", "Publish the event before playtesting.");
  const baseName = `Playtest · ${staff.name || staff.email.split("@")[0]}`.slice(0, 28);
  const existing = await db.select().from(teams).where(and(eq(teams.eventId, id), eq(teams.kind, "playtest"), eq(teams.createdBy, staff.id)));
  if (existing.length && !opts.reset) return existing[0]!;
  const name = existing.length ? `${baseName.slice(0, 24)} #${existing.length + 1}` : baseName;
  const [t] = await db
    .insert(teams)
    .values({ eventId: id, name, nameKey: name.toLowerCase(), passwordHash: await hashPassword(randomToken(24)), kind: "playtest", createdBy: staff.id })
    .returning();
  await db.insert(participants).values({ teamId: t!.id, displayName: staff.name || "Organiser" });
  return t!;
}

/** The seven stations of the production line, read from the draft's real state. */
function pipelineOf(event: EventRow, draft: StudioDraft, a: ReturnType<typeof analyzeBlueprint> | null) {
  const bp = draft.blueprint;
  const st = draft.story;
  const lv = draft.lastValidation;
  const nodes = a ? [...a.nodes.values()] : [];
  return derivePipeline({
    hasStory: Boolean(st),
    story: st
      ? {
          characters: st.characters.length,
          suspects: st.characters.filter((c) => c.suspect).length,
          locations: st.locations.length,
          timeline: st.timeline.length,
          organisations: st.organizations.length,
          artifacts: st.artifacts.length,
          sources: draft.sources.length,
        }
      : null,
    blueprint: bp
      ? {
          nodes: bp.nodes.length,
          rounds: bp.rounds.length,
          acts: bp.acts.length,
          mechanics: new Set(bp.nodes.map((n) => n.primitive)).size,
          families: new Set(bp.rounds.map((r) => r.family)).size,
          evidence: bp.evidence.length,
          facts: Object.keys(bp.world.facts).length,
          sites: bp.sites.length,
          checkpoints: bp.checkpoints.length,
          redHerrings: bp.redHerrings.length,
        }
      : null,
    graph: a
      ? {
          edges: a.edges.length,
          maxDepth: a.maxDepth,
          criticalMinutes: a.criticalMinutes,
          totalMinutes: a.totalMinutes,
          perTeam: nodes.filter((n) => n.perTeam).length,
          textOnlyRisk: nodes.length ? nodes.filter((n) => n.textOnly > 0.5).length / nodes.length : 0,
        }
      : null,
    presentation: { theme: draft.presentation.theme, intensity: draft.presentation.intensity, hasWording: Boolean(draft.presentation.cinematic.kicker || draft.presentation.cinematic.caseNumber || draft.presentation.cinematic.lines.length) },
    validation: lv ? { ok: lv.ok, errors: lv.errors.length, warnings: lv.warnings.length, solved: lv.stats.solvedInPlaythrough, nodes: lv.stats.nodes, stale: lv.rev !== undefined && lv.rev !== draft.rev, at: lv.at } : null,
    published: { version: event.blueprintVersion, active: event.active, at: event.publishedAt?.toISOString() ?? null },
    dirtySincePublish: Boolean(event.blueprintVersion && draft.published && draft.published.srev !== draft.srev),
  });
}

/** The name of a *different* event that is live right now, if any: going live would replace it. */
export async function otherActiveEvent(db: Executor, id: string): Promise<string | null> {
  const [live] = await db.select({ id: events.id, name: events.name }).from(events).where(and(eq(events.active, true), not(eq(events.id, id)))).limit(1);
  return live?.name ?? null;
}

export function studioView(event: EventRow, draft: StudioDraft, otherActive: string | null = null) {
  const bp = draft.blueprint;
  const a = bp ? analyzeBlueprint(bp) : null;
  return {
    otherActive,
    pipeline: pipelineOf(event, draft, a),
    trace: draft.trace,
    event: { id: event.id, name: event.name, kind: event.kind, status: event.status, active: event.active, version: event.blueprintVersion, publishedAt: event.publishedAt?.toISOString() ?? null },
    draft: { ...draft, proposalPreview: undefined },
    catalog: primitiveCatalog(),
    graph: bp && a
      ? {
          nodes: bp.nodes.map((n) => {
            const an = a.nodes.get(n.id)!;
            const round = bp.rounds.find((r) => r.id === n.round)!;
            return {
              id: n.id,
              title: n.title,
              primitive: n.primitive,
              round: n.round,
              roundTitle: round.title,
              family: round.family,
              tier: round.tier,
              act: round.act,
              depth: an.dependencyDepth,
              score: an.score,
              profile: an.profile,
              textOnly: an.textOnly,
              perTeam: an.perTeam,
              minutes: n.estimatedMinutes,
              points: n.scoring.points,
              optional: n.optional,
              redHerring: Boolean(n.redHerring),
              skills: an.skills,
              tools: an.tools,
              channels: an.interaction.channels,
              hints: n.hints.length,
              evidence: n.rewards.evidence,
              deps: an.deps,
              critical: a.criticalPath.includes(n.id),
              configError: an.configError,
            };
          }),
          edges: a.edges,
          criticalMinutes: a.criticalMinutes,
          totalMinutes: a.totalMinutes,
          maxDepth: a.maxDepth,
        }
      : null,
  };
}
