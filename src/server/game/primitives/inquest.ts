import { z } from "zod";
import { profile } from "../core/difficulty";
import { RELATION_KINDS } from "../core/blueprint";
import { render, shiftTime } from "../core/template";
import type { StateEventBody } from "../core/state";
import type { ChallengePrimitive, Instance, Transition } from "./types";
import { answerMatches, attempts } from "./types";

/* ═══════════════════════════ EVIDENCE-BOARD DEDUCTION ═══════════════════════════ */

const BoardConfig = z
  .object({
    prompt: z.string().max(1500).default("Connect the evidence. Label each string with the relationship it proves, then submit the board for analysis."),
    /** Use the blueprint's relation truth table (default) or an explicit list. */
    relations: z
      .array(z.object({ from: z.string().regex(/^(ev|sus|loc|tl):[a-z0-9-]+$/), to: z.string().regex(/^(ev|sus|loc|tl):[a-z0-9-]+$/), kind: z.enum(RELATION_KINDS) }).strict())
      .optional(),
    required: z.number().int().min(1).max(50).default(4),
    maxUnsupported: z.number().int().min(0).max(50).default(3),
  })
  .strict();
type BoardC = z.infer<typeof BoardConfig>;
type Rel = { from: string; to: string; kind: string };

export function scoreBoard(links: { from: string; to: string; label: string }[], truth: Rel[]) {
  let valid = 0;
  let invalid = 0;
  const matched = new Set<number>();
  for (const l of links) {
    const kind = l.label.trim().toLowerCase();
    // Unlabelled strings and free-text labels are notes, not assertions.
    if (!kind || !(RELATION_KINDS as readonly string[]).includes(kind)) continue;
    // Direction is ignored: players drag from whichever card is closer.
    const i = truth.findIndex((t, k) => !matched.has(k) && t.kind === kind && ((t.from === l.from && t.to === l.to) || (t.from === l.to && t.to === l.from)));
    if (i >= 0) {
      matched.add(i);
      valid++;
    } else invalid++;
  }
  return { valid, invalid };
}

export const boardDeduction: ChallengePrimitive<BoardC, null, { truth: Rel[]; config: BoardC }, { type: "evaluate" }> = {
  id: "board-deduction",
  version: "1.0.0",
  family: "inquest",
  label: "Evidence-board deduction",
  summary: "The team's evidence board is analysed server-side: labelled links are checked against the case's relationship truth table.",
  schema: BoardConfig,
  actionSchema: z.object({ type: z.literal("evaluate") }).strict(),
  example: () => ({ required: 4, maxUnsupported: 3 }),
  createInstance(config, ctx): Instance<null, { truth: Rel[]; config: BoardC }> {
    const truth = (config.relations ?? ctx.blueprint.relations).map((r) => ({ from: r.from, to: r.to, kind: r.kind }));
    return { public: null, secret: { truth, config }, outputs: {}, guarded: [] };
  },
  view: (inst, node) => ({
    kind: "board",
    prompt: inst.secret.config.prompt,
    required: inst.secret.config.required,
    maxUnsupported: inst.secret.config.maxUnsupported,
    vocabulary: RELATION_KINDS,
    attempts: attempts(node),
  }),
  validateAction: () => ({ ok: true }),
  async applyAction(_a, inst, node, _state, rt): Promise<Transition> {
    const links = rt.boardLinks ? await rt.boardLinks() : [];
    const { valid, invalid } = scoreBoard(links, inst.secret.truth);
    const c = inst.secret.config;
    const solved = valid >= c.required && invalid <= c.maxUnsupported;
    const events: StateEventBody[] = [{ type: "board.evaluated", node: "", valid, invalid }];
    if (!solved) events.push({ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 });
    return {
      events,
      solved,
      correct: solved,
      feedback: solved
        ? { tone: "success", title: "THEORY HOLDS", message: `${valid} relationships are supported by the evidence.` }
        : {
            tone: valid > 0 ? "partial" : "fail",
            title: "THEORY INCOMPLETE",
            message: `${valid} of ${c.required} required relationships are supported${invalid ? `; ${invalid} labelled link${invalid === 1 ? " is" : "s are"} unsupported${invalid > c.maxUnsupported ? " — too many to accept" : ""}` : ""}.`,
          },
    };
  },
  intendedSolution: () => [{ type: "evaluate" }],
  isAttempt: () => true,
  difficulty: (c) => profile({ reasoningDifficulty: 6 + Math.min(4, c.required / 2), interactionDepth: 6, statefulness: 7, dependencyDepth: 4, crossModalComplexity: 5 }),
  describe: () => ({ skills: ["deductive reasoning", "evidence correlation"], tools: ["the evidence board"], interaction: { channels: ["state"], textExposure: 0.05 } }),
};

/* ═══════════════════════════ PHYSICAL CHECKPOINTS ═══════════════════════════ */

const QrConfig = z.object({ checkpoint: z.string().max(63), prompt: z.string().max(1500).default("") }).strict();

export const qrCheckpoint: ChallengePrimitive<z.infer<typeof QrConfig>, { checkpoint: string; prompt: string }, null, { type: "check" }> = {
  id: "qr-checkpoint",
  version: "1.0.0",
  family: "physical",
  label: "QR checkpoint",
  summary: "Solved when the team's claim at a physical QR checkpoint is confirmed (HMAC tokens, rotation, expiry, claim limits, volunteer approval).",
  schema: QrConfig,
  actionSchema: z.object({ type: z.literal("check") }).strict(),
  example: () => ({ checkpoint: "observatory" }),
  createInstance: (c) => ({ public: { checkpoint: c.checkpoint, prompt: c.prompt }, secret: null, outputs: {}, guarded: [] }),
  view: (inst, _n, state) => ({ kind: "checkpoint", checkpoint: inst.public.checkpoint, prompt: inst.public.prompt, confirmed: Boolean(state.checkpoints[inst.public.checkpoint]) }),
  validateAction: () => ({ ok: true }),
  applyAction(_a, inst, _n, state): Transition {
    const ok = Boolean(state.checkpoints[inst.public.checkpoint]);
    return { events: [], solved: ok, correct: null, feedback: ok ? { tone: "success", title: "CHECKPOINT CONFIRMED" } : { tone: "info", title: "NOT YET CONFIRMED", message: "Scan the code at the location. Some stations need a volunteer to confirm." } };
  },
  intendedSolution: () => [{ type: "check" }],
  isAttempt: () => false,
  difficulty: () => profile({ interactionDepth: 4, physicalDependency: 9, instanceUniqueness: 3 }),
  describe: () => ({ skills: ["navigation"], tools: ["a phone camera"], interaction: { channels: ["physical"], textExposure: 0 } }),
};

const GpsConfig = z.object({ checkpoint: z.string().max(63), maxAccuracyM: z.number().min(5).max(500).default(60), prompt: z.string().max(1500).default("") }).strict();
const GpsAction = z.object({ type: z.literal("locate"), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000) }).strict();

export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface GpsSec {
  geo: { lat: number; lon: number; radiusM: number };
  maxAccuracyM: number;
}

export const gpsCheckpoint: ChallengePrimitive<z.infer<typeof GpsConfig>, { checkpoint: string; prompt: string; radiusM: number }, GpsSec, z.infer<typeof GpsAction>> = {
  id: "gps-checkpoint",
  version: "1.0.0",
  family: "physical",
  label: "GPS geofence",
  summary: "Solved by checking in from inside an organiser-defined geofence on public campus ground. Low assurance: pair with QR/volunteer checks for high stakes.",
  schema: GpsConfig,
  actionSchema: GpsAction,
  example: () => ({ checkpoint: "quad-mast", maxAccuracyM: 60 }),
  createInstance(c, ctx) {
    const cp = ctx.blueprint.checkpoints.find((x) => x.id === c.checkpoint);
    if (!cp?.geo) throw new Error(`gps-checkpoint: checkpoint "${c.checkpoint}" has no geo coordinates`);
    return { public: { checkpoint: c.checkpoint, prompt: c.prompt, radiusM: cp.geo.radiusM }, secret: { geo: cp.geo, maxAccuracyM: c.maxAccuracyM }, outputs: {}, guarded: [] };
  },
  view: (inst, _n, state) => ({ kind: "gps", checkpoint: inst.public.checkpoint, prompt: inst.public.prompt, radiusM: inst.public.radiusM, confirmed: Boolean(state.checkpoints[inst.public.checkpoint]) }),
  validateAction(a, inst) {
    if (a.accuracy > inst.secret.maxAccuracyM) return { ok: false, code: "invalid", message: `Location accuracy is ±${Math.round(a.accuracy)} m; move into the open and retry (need ±${inst.secret.maxAccuracyM} m).` };
    return { ok: true };
  },
  applyAction(a, inst, node): Transition {
    const d = haversineM(a, inst.secret.geo);
    const ok = d <= inst.secret.geo.radiusM + Math.min(a.accuracy, 15);
    const id = inst.public.checkpoint;
    return {
      events: ok ? [{ type: "checkpoint.confirmed", id }] : [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
      solved: ok,
      correct: ok,
      submission: `${a.lat.toFixed(5)},${a.lon.toFixed(5)} ±${Math.round(a.accuracy)}`,
      feedback: ok ? { tone: "success", title: "LOCATION VERIFIED" } : { tone: "fail", title: "OUTSIDE THE GEOFENCE", message: `You appear to be about ${Math.round(d)} m away.` },
    };
  },
  intendedSolution: (inst) => [{ type: "locate", lat: inst.secret.geo.lat, lon: inst.secret.geo.lon, accuracy: 8 }],
  isAttempt: () => true,
  difficulty: () => profile({ interactionDepth: 3, physicalDependency: 10 }),
  describe: () => ({ skills: ["navigation"], tools: ["a phone with location services"], interaction: { channels: ["physical"], textExposure: 0 } }),
};

/* ═══════════════════════════ FINAL RECONSTRUCTION ═══════════════════════════ */

const Field = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    label: z.string().min(1).max(80),
    type: z.enum(["suspect", "choice", "location", "evidence", "time", "code"]),
    options: z.array(z.object({ id: z.string().max(63), label: z.string().max(120) }).strict()).default([]),
    /** Accepted value(s): option/character/location/evidence ids, an HH:MM template, or a code template. */
    answer: z.array(z.string().min(1).max(200)).min(1),
    points: z.number().int().min(0).max(100_000),
    toleranceMinutes: z.number().int().min(0).max(120).default(0),
  })
  .strict();

const FinalConfig = z
  .object({
    prompt: z.string().max(3000).default("File your reconstruction of the case."),
    fields: z.array(Field).min(1).max(12),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    penalties: z.array(z.number().int().min(0).max(10_000)).min(1).default([0, 50, 100]),
    /** Awarded only when every field is right: a coherent reconstruction beats a lucky partial one. */
    coherenceBonus: z.number().int().min(0).max(100_000).default(0),
  })
  .strict();
type FinalC = z.infer<typeof FinalConfig>;
const FinalAction = z.object({ type: z.literal("accuse"), answers: z.record(z.string().max(40), z.string().max(200)) }).strict();

function fieldCorrect(f: FinalC["fields"][number], v: string): boolean {
  if (!v) return false;
  if (f.type === "time") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return false;
    const vm = Number(m[1]) * 60 + Number(m[2]);
    return f.answer.some((a) => {
      const am = /^(\d{1,2}):(\d{2})$/.exec(a.trim());
      if (!am) return false;
      const diff = Math.abs(vm - (Number(am[1]) * 60 + Number(am[2])));
      return Math.min(diff, 1440 - diff) <= f.toleranceMinutes;
    });
  }
  if (f.type === "code") return answerMatches(v, f.answer, "loose");
  return f.answer.includes(v);
}

export const finalReconstruction: ChallengePrimitive<FinalC, null, FinalC, z.infer<typeof FinalAction>> = {
  id: "final-reconstruction",
  version: "1.0.0",
  family: "final",
  label: "Final reconstruction",
  summary: "Structured accusation (culprit, motive, method, location, timestamp, key evidence, final code) with per-field partial credit, penalties and a coherence bonus.",
  schema: FinalConfig,
  actionSchema: FinalAction,
  example: () => ({
    fields: [
      { id: "culprit", label: "Culprit", type: "suspect", answer: ["marsh"], points: 200 },
      { id: "time", label: "Time of the wipe", type: "time", answer: ["{{wipeTime}}"], points: 100, toleranceMinutes: 2 },
    ],
    coherenceBonus: 200,
  }),
  createInstance: (c, ctx) => {
    const r = render(c, ctx.facts);
    return { public: null, secret: r, outputs: {}, guarded: r.fields.filter((f) => f.type === "code" || f.type === "time").flatMap((f) => f.answer) };
  },
  view(inst, _node, state) {
    const c = inst.secret;
    return {
      kind: "final",
      prompt: c.prompt,
      fields: c.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, points: f.points, options: f.options })),
      maxAttempts: c.maxAttempts,
      attemptsUsed: state.final.attempts,
      bestCredit: state.final.bestCredit,
      solved: state.final.solved,
      nextPenalty: c.penalties[Math.min(state.final.attempts, c.penalties.length - 1)] ?? 0,
      coherenceBonus: c.coherenceBonus,
    };
  },
  validateAction(a, inst, _n, state) {
    const c = inst.secret;
    if (state.final.solved) return { ok: false, code: "conflict", message: "Your reconstruction is already locked in." };
    if (state.final.attempts >= c.maxAttempts) return { ok: false, code: "attempts_exhausted", message: "No filing attempts remain." };
    for (const f of c.fields) {
      const v = a.answers[f.id]?.trim();
      if (!v) return { ok: false, code: "invalid", message: `Fill in "${f.label}".` };
      if (f.type === "evidence" && !state.evidence[v]) return { ok: false, code: "invalid", message: "Key evidence must be an exhibit your team holds." };
      if ((f.type === "choice" || ((f.type === "suspect" || f.type === "location") && f.options.length)) && !f.options.some((o) => o.id === v))
        return { ok: false, code: "invalid", message: `Invalid choice for "${f.label}".` };
    }
    return { ok: true };
  },
  applyAction(a, inst, _n, state): Transition {
    const c = inst.secret;
    const correct = c.fields.filter((f) => fieldCorrect(f, a.answers[f.id]!.trim())).map((f) => f.id);
    const all = correct.length === c.fields.length;
    const credit = c.fields.filter((f) => correct.includes(f.id)).reduce((s, f) => s + f.points, 0) + (all ? c.coherenceBonus : 0);
    const attempt = state.final.attempts + 1;
    const penalty = all ? 0 : (c.penalties[Math.min(state.final.attempts, c.penalties.length - 1)] ?? 0);
    const delta = Math.max(0, credit - state.final.bestCredit) - penalty;
    const exhausted = !all && attempt >= c.maxAttempts;
    return {
      events: [{ type: "final.submitted", node: "", attempt, credit, correct, total: c.fields.length, solved: all }],
      solved: all,
      correct: all,
      ledgerPoints: delta,
      ledgerReason: `final attempt ${attempt}: ${correct.length}/${c.fields.length}`,
      solvePoints: 0,
      fail: exhausted,
      submission: Object.values(a.answers).join(" | ").slice(0, 120),
      feedback: all
        ? { tone: "success", title: "CASE CLOSED", message: `Every finding holds. +${credit} including the coherence bonus.` }
        : {
            tone: correct.length ? "partial" : "fail",
            title: "RECONSTRUCTION INCOMPLETE",
            // Feedback states HOW MANY findings hold, never WHICH.
            message: `${correct.length} of ${c.fields.length} findings hold up.${penalty ? ` Penalty −${penalty}.` : ""}${exhausted ? " No attempts remain." : ` ${c.maxAttempts - attempt} attempt${c.maxAttempts - attempt === 1 ? "" : "s"} left.`}`,
            data: { correctCount: correct.length, total: c.fields.length, delta },
          },
    };
  },
  intendedSolution: (inst) => [
    {
      type: "accuse",
      answers: Object.fromEntries(inst.secret.fields.map((f) => [f.id, f.type === "time" ? shiftTime(f.answer[0]!, 0) : f.answer[0]!])),
    },
  ],
  isAttempt: () => true,
  difficulty: (c) =>
    profile({
      reasoningDifficulty: 8,
      interactionDepth: 5,
      statefulness: 6,
      dependencyDepth: 7,
      crossModalComplexity: 7,
      redHerringDensity: 5,
      instanceUniqueness: c.fields.some((f) => f.type === "code" || f.type === "time") ? 8 : 2,
    }),
  describe: () => ({ skills: ["synthesis across every round"], tools: ["everything you have found"], interaction: { channels: ["state"], textExposure: 0.1 } }),
};
