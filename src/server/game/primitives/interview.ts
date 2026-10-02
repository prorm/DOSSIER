import { z } from "zod";
import { profile } from "../core/difficulty";
import { render } from "../core/template";
import type { GameState, StateEventBody } from "../core/state";
import type { ChallengePrimitive, Instance, Transition } from "./types";

/**
 * Deterministic suspect interview. A suspect has a script of topics (each a
 * truth, a lie, an evasion, or outside their knowledge), and confrontations:
 * presenting a held evidence item can break a lie (recording a contradiction)
 * or unlock new topics. No text generation: every line is authored or
 * templated from world facts, and availability is a pure function of state.
 */
const Req = z
  .object({ evidence: z.string().max(63).optional(), asked: z.string().max(40).optional(), contradiction: z.string().max(40).optional() })
  .strict()
  .default({});

const Topic = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    question: z.string().min(1).max(200),
    answer: z.string().min(1).max(1500),
    kind: z.enum(["truth", "lie", "evasive", "unknown"]).default("truth"),
    requires: Req,
    reveals: z.object({ evidence: z.array(z.string().max(63)).default([]), flags: z.record(z.string().max(60), z.union([z.string(), z.number(), z.boolean()])).default({}) }).strict().default({ evidence: [], flags: {} }),
  })
  .strict();

const Confrontation = z
  .object({
    evidence: z.string().max(63),
    response: z.string().min(1).max(1500),
    requires: Req,
    contradiction: z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), label: z.string().max(160), breaks: z.string().max(40).optional() }).strict().optional(),
    reveals: z.object({ evidence: z.array(z.string().max(63)).default([]), flags: z.record(z.string().max(60), z.union([z.string(), z.number(), z.boolean()])).default({}) }).strict().default({ evidence: [], flags: {} }),
  })
  .strict();

const Config = z
  .object({
    suspect: z.string().max(63),
    name: z.string().max(80),
    intro: z.string().max(1500).default(""),
    topics: z.array(Topic).min(1).max(30),
    confrontations: z.array(Confrontation).max(20).default([]),
    /** Default reply when confronted with irrelevant evidence. */
    deflect: z.string().max(400).default("I don't see what that has to do with me."),
    goal: z.object({ contradictions: z.array(z.string()).default([]), flags: z.array(z.string()).default([]) }).strict(),
  })
  .strict();
type C = z.infer<typeof Config>;

const Action = z.union([
  z.object({ type: z.literal("ask"), topic: z.string().max(40) }).strict(),
  z.object({ type: z.literal("confront"), evidence: z.string().max(63) }).strict(),
]);
type A = z.infer<typeof Action>;

function met(r: z.infer<typeof Req>, s: GameState, suspect: string): boolean {
  if (r.evidence && !s.evidence[r.evidence]) return false;
  if (r.asked && !(s.suspects[suspect]?.asked ?? []).includes(r.asked)) return false;
  if (r.contradiction && !s.contradictions[r.contradiction]) return false;
  return true;
}

function goalReached(c: C, contradictions: Set<string>, flags: Record<string, unknown>) {
  return c.goal.contradictions.every((x) => contradictions.has(x)) && c.goal.flags.every((f) => Boolean(flags[f]));
}

export const interview: ChallengePrimitive<C, null, C, A> = {
  id: "interview",
  version: "1.0.0",
  family: "inquest",
  label: "Suspect interview",
  summary: "Deterministic interrogation: truths, lies, knowledge boundaries and evidence-triggered contradictions, all driven by game state.",
  schema: Config,
  actionSchema: Action,
  example: () => ({
    suspect: "marsh",
    name: "Theo Marsh",
    topics: [{ id: "where", question: "Where were you at 02:45?", answer: "Home. Asleep.", kind: "lie" }],
    confrontations: [{ evidence: "wifi-sessions", response: "…Fine. I was in the lab.", contradiction: { id: "marsh-alibi", label: "Marsh's alibi contradicts the Wi-Fi log", breaks: "where" } }],
    goal: { contradictions: ["marsh-alibi"] },
  }),
  createInstance(config, ctx): Instance<null, C> {
    return { public: null, secret: render(config, ctx.facts), outputs: {}, guarded: [] };
  },
  view(inst, _node, state) {
    const c = inst.secret;
    const st = state.suspects[c.suspect] ?? { asked: [], confronted: [], contradictions: [] };
    const broken = new Set(c.confrontations.filter((x) => x.contradiction && st.contradictions.includes(x.contradiction.id)).map((x) => x.contradiction!.breaks));
    return {
      kind: "interview",
      suspect: c.suspect,
      name: c.name,
      intro: c.intro,
      transcript: [
        ...st.asked.map((id) => c.topics.find((t) => t.id === id)).filter(Boolean).map((t) => ({ kind: "ask" as const, id: t!.id, q: t!.question, a: t!.answer, contradicted: broken.has(t!.id) })),
        ...st.confronted.map((ev) => {
          const x = c.confrontations.find((y) => y.evidence === ev);
          return { kind: "confront" as const, id: ev, q: `Presented evidence: ${ev}`, a: x?.response ?? c.deflect, contradicted: false };
        }),
      ],
      available: c.topics.filter((t) => !st.asked.includes(t.id) && met(t.requires, state, c.suspect)).map((t) => ({ id: t.id, question: t.question })),
      contradictions: st.contradictions.map((id) => ({ id, label: state.contradictions[id]?.label ?? id })),
      goal: { contradictions: c.goal.contradictions.length, reached: c.goal.contradictions.filter((x) => st.contradictions.includes(x)).length },
    };
  },
  validateAction(action, inst, _node, state) {
    const c = inst.secret;
    if (action.type === "ask") {
      const t = c.topics.find((x) => x.id === action.topic);
      if (!t || !met(t.requires, state, c.suspect)) return { ok: false, code: "invalid", message: "That line of questioning is not open yet." };
      return { ok: true };
    }
    if (!state.evidence[action.evidence]) return { ok: false, code: "invalid", message: "You can only present evidence your team holds." };
    if ((state.suspects[c.suspect]?.confronted ?? []).includes(action.evidence)) return { ok: false, code: "conflict", message: "You already presented that." };
    return { ok: true };
  },
  applyAction(action, inst, _node, state): Transition {
    const c = inst.secret;
    const events: StateEventBody[] = [];
    const contradictions = new Set(state.suspects[c.suspect]?.contradictions ?? []);
    const flags: Record<string, unknown> = { ...state.flags };
    const reveal = (r: { evidence: string[]; flags: Record<string, string | number | boolean> }) => {
      for (const e of r.evidence) if (!state.evidence[e]) events.push({ type: "evidence.gained", id: e, source: `interview:${c.suspect}` });
      for (const [k, v] of Object.entries(r.flags)) {
        events.push({ type: "flag.set", key: k, value: v });
        flags[k] = v;
      }
    };
    let message: string;
    if (action.type === "ask") {
      const t = c.topics.find((x) => x.id === action.topic)!;
      events.push({ type: "interview.asked", node: "", suspect: c.suspect, question: t.id });
      reveal(t.reveals);
      message = t.answer;
    } else {
      events.push({ type: "interview.confronted", node: "", suspect: c.suspect, evidence: action.evidence, hit: false });
      const x = c.confrontations.find((y) => y.evidence === action.evidence && met(y.requires, state, c.suspect));
      if (x) {
        (events[events.length - 1] as { hit: boolean }).hit = true;
        if (x.contradiction && !contradictions.has(x.contradiction.id)) {
          events.push({ type: "contradiction", node: "", suspect: c.suspect, id: x.contradiction.id, label: x.contradiction.label });
          contradictions.add(x.contradiction.id);
        }
        reveal(x.reveals);
        message = x.response;
      } else message = c.deflect;
    }
    const solved = goalReached(c, contradictions, flags);
    return {
      events,
      solved,
      correct: null,
      feedback: solved
        ? { tone: "success", title: "STATEMENT BROKEN", message }
        : { tone: "info", title: `${c.name.toUpperCase()}`, message },
    };
  },
  intendedSolution(inst, state) {
    // Ask every topic in a dependency-respecting order, then present every confrontation's evidence (skipping what the team already did).
    const c = inst.secret;
    const st = state.suspects[c.suspect] ?? { asked: [], confronted: [], contradictions: [] };
    const asks: A[] = [];
    const done = new Set<string>(st.asked);
    for (let pass = 0; pass < c.topics.length; pass++)
      for (const t of c.topics) if (!done.has(t.id) && (!t.requires.asked || done.has(t.requires.asked))) {
        done.add(t.id);
        asks.push({ type: "ask", topic: t.id });
      }
    return [...asks, ...c.confrontations.filter((x) => !st.confronted.includes(x.evidence)).map((x) => ({ type: "confront" as const, evidence: x.evidence }))];
  },
  isAttempt: (a) => a.type === "confront",
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 2,
      reasoningDifficulty: 5 + c.goal.contradictions.length,
      interactionDepth: 5 + Math.min(4, c.topics.length / 3),
      statefulness: 8,
      dependencyDepth: Math.min(10, new Set(c.confrontations.map((x) => x.evidence)).size + 1),
      redHerringDensity: c.topics.filter((t) => t.kind === "evasive").length * 1.5,
      instanceUniqueness: JSON.stringify(c).includes("{{") ? 5 : 1,
    }),
  describe: (c) => ({
    skills: ["interrogation strategy", "evidence correlation"],
    tools: ["the evidence locker"],
    interaction: { channels: ["dialogue", "state"], textExposure: c.confrontations.length ? 0.1 : 0.4 },
  }),
};
