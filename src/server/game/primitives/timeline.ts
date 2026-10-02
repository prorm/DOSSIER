import { z } from "zod";
import { profile } from "../core/difficulty";
import { render } from "../core/template";
import type { ChallengePrimitive, Transition } from "./types";
import { attempts } from "./types";

/**
 * Timeline reconstruction. Each event is shown as its *source* reported it —
 * with that source's clock, timezone and skew. Players must normalise the
 * clocks, order the events, and discard claims that contradict the evidence.
 * Some events stay missing until the team holds the evidence that reveals them.
 */
const Event = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
    label: z.string().min(1).max(160),
    source: z.string().max(80),
    /** What the source recorded, e.g. "21:14:07 UTC" or "02:48 (door controller, runs 3 min fast)". Templated. */
    shown: z.string().max(160),
    /** Ground truth in reference local time "HH:MM" (templated). */
    trueTime: z.string().max(80),
    /** Day offset relative to the reference date (for events after midnight). */
    day: z.number().int().min(-1).max(2).default(0),
    confidence: z.enum(["high", "medium", "low"]).default("high"),
    /** A false claim (e.g. an alibi statement) that must be discarded, not placed. */
    contradictory: z.boolean().default(false),
    /** Hidden until the team holds this evidence id. */
    requiresEvidence: z.string().max(63).optional(),
  })
  .strict();

const Config = z
  .object({
    prompt: z.string().max(2000).default("Put the events in the order they really happened. Discard any claim the evidence contradicts."),
    referenceTz: z.string().max(40).default("lab local time"),
    events: z.array(Event).min(3).max(20),
  })
  .strict()
  .refine((c) => new Set(c.events.map((e) => e.id)).size === c.events.length, "event ids must be unique");
type C = z.infer<typeof Config>;

const Action = z
  .object({
    type: z.literal("order"),
    order: z.array(z.string().max(41)).max(20),
    discard: z.array(z.string().max(41)).max(20).default([]),
  })
  .strict();
type A = z.infer<typeof Action>;

interface Ev {
  id: string;
  label: string;
  source: string;
  shown: string;
  confidence: string;
  requiresEvidence?: string;
  key: number;
  contradictory: boolean;
}

function minutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) throw new Error(`timeline trueTime "${hhmm}" is not HH:MM after templating`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Fraction of event pairs placed in the correct relative order (Kendall-style concordance). */
export function concordance(submitted: string[], truth: string[]): number {
  const pos = new Map(submitted.map((id, i) => [id, i]));
  let good = 0;
  let total = 0;
  for (let i = 0; i < truth.length; i++)
    for (let j = i + 1; j < truth.length; j++) {
      total++;
      const a = pos.get(truth[i]!);
      const b = pos.get(truth[j]!);
      if (a !== undefined && b !== undefined && a < b) good++;
    }
  return total ? good / total : 1;
}

export const timeline: ChallengePrimitive<C, { prompt: string; referenceTz: string }, { events: Ev[]; truth: string[]; contradictory: string[] }, A> = {
  id: "timeline",
  version: "1.0.0",
  family: "inquest",
  label: "Timeline reconstruction",
  summary: "Order events reported by sources with different clocks, skews and timezones; discard contradicted claims; recover missing events.",
  schema: Config,
  actionSchema: Action,
  example: () => ({
    events: [
      { id: "storm", label: "Storm cuts mains power", source: "UPS controller", shown: "21:01 UTC", trueTime: "02:31" },
      { id: "wipe", label: "Workstation wipe begins", source: "syslog", shown: "{{wipeTime}}:41 IST", trueTime: "{{wipeTime}}" },
      { id: "tx", label: "Transmission received", source: "Radio club log", shown: "03:14 IST", trueTime: "03:14" },
    ],
  }),
  createInstance(config, ctx) {
    const r = render(config, ctx.facts);
    const events: Ev[] = r.events.map((e) => ({
      id: e.id,
      label: e.label,
      source: e.source,
      shown: e.shown,
      confidence: e.confidence,
      requiresEvidence: e.requiresEvidence,
      key: e.day * 1440 + minutes(e.trueTime),
      contradictory: e.contradictory,
    }));
    const truth = events
      .filter((e) => !e.contradictory)
      .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
      .map((e) => e.id);
    return {
      public: { prompt: r.prompt, referenceTz: r.referenceTz },
      secret: { events, truth, contradictory: events.filter((e) => e.contradictory).map((e) => e.id) },
      outputs: { order: truth.join(">") },
      guarded: [],
    };
  },
  view(inst, node, state) {
    const visible = inst.secret.events.filter((e) => !e.requiresEvidence || state.evidence[e.requiresEvidence]);
    // Deterministic but truth-independent presentation order (alphabetical by source, then label).
    const cards = [...visible].sort((a, b) => a.source.localeCompare(b.source) || a.label.localeCompare(b.label)).map((e) => ({ id: e.id, label: e.label, source: e.source, shown: e.shown, confidence: e.confidence }));
    return {
      kind: "timeline",
      prompt: inst.public.prompt,
      referenceTz: inst.public.referenceTz,
      events: cards,
      missing: inst.secret.events.length - visible.length,
      best: Number(node?.steps["best"] ?? 0),
      attempts: attempts(node),
    };
  },
  validateAction(action, inst, _node, state) {
    const visible = new Set(inst.secret.events.filter((e) => !e.requiresEvidence || state.evidence[e.requiresEvidence]).map((e) => e.id));
    const all = [...action.order, ...action.discard];
    if (new Set(all).size !== all.length) return { ok: false, code: "invalid", message: "Each event can appear only once." };
    if (all.some((id) => !visible.has(id))) return { ok: false, code: "invalid", message: "Unknown event in submission." };
    if (all.length !== visible.size) return { ok: false, code: "invalid", message: "Place or discard every event on the board." };
    return { ok: true };
  },
  applyAction(action, inst, node): Transition {
    const s = inst.secret;
    const score = concordance(action.order, s.truth);
    const discardOk = action.discard.length === s.contradictory.length && action.discard.every((d) => s.contradictory.includes(d));
    const complete = action.order.length === s.truth.length;
    const solved = complete && discardOk && action.order.every((id, i) => s.truth[i] === id);
    const best = Math.max(Number(node?.steps["best"] ?? 0), Math.round(score * 100));
    const placedWrong = action.order.filter((id) => s.contradictory.includes(id)).length;
    const events: Transition["events"] = [
      { type: "node.step", node: "", key: "best", value: best },
      ...(solved ? [] : [{ type: "node.step" as const, node: "", key: "attempts", value: attempts(node) + 1 }]),
    ];
    if (solved) return { events, solved: true, correct: true, feedback: { tone: "success", title: "TIMELINE LOCKED", message: "Every event is in place and every false claim set aside." } };
    const notes = [`${Math.round(score * 100)}% of event pairs are in the right relative order.`];
    if (!complete) notes.push("Some events are still missing from the reconstruction — the evidence locker may hold the rest.");
    if (placedWrong) notes.push(`${placedWrong} placed claim${placedWrong === 1 ? " is" : "s are"} contradicted by the evidence.`);
    else if (!discardOk) notes.push("Your discard pile is not right yet.");
    return { events, correct: false, submission: action.order.join(">").slice(0, 120), feedback: { tone: score > 0.6 ? "partial" : "fail", title: "TIMELINE INCONSISTENT", message: notes.join(" "), data: { concordance: score } } };
  },
  intendedSolution: (inst) => [{ type: "order", order: inst.secret.truth, discard: inst.secret.contradictory }],
  isAttempt: () => true,
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 3,
      reasoningDifficulty: 5 + Math.min(4, c.events.length / 3),
      interactionDepth: 4,
      statefulness: c.events.some((e) => e.requiresEvidence) ? 7 : 3,
      dependencyDepth: c.events.some((e) => e.requiresEvidence) ? 3 : 1,
      crossModalComplexity: new Set(c.events.map((e) => e.source)).size,
      redHerringDensity: c.events.filter((e) => e.contradictory).length * 2.5,
      instanceUniqueness: c.events.some((e) => e.trueTime.includes("{{")) ? 7 : 2,
    }),
  describe: (c) => ({
    skills: ["clock normalisation", "timezone arithmetic", ...(c.events.some((e) => e.contradictory) ? ["spotting false claims"] : [])],
    tools: ["the evidence locker", "a notepad"],
    interaction: { channels: ["state", "text"], textExposure: 0.35 },
  }),
};
