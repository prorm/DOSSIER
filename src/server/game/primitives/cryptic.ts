import { z } from "zod";
import { profile } from "../core/difficulty";
import { renderString } from "../core/template";
import type { ChallengePrimitive, Instance, Transition } from "./types";
import { answerMatches, attempts } from "./types";

/**
 * Multi-clue cryptic puzzle. Steps are solved in order; each step's reveal
 * becomes part of the next step's context. Answers are templates over world
 * facts, so the same puzzle architecture yields different answers per team.
 */
const Step = z
  .object({
    prompt: z.string().min(1).max(6000),
    answer: z.string().min(1).max(200),
    alternates: z.array(z.string().min(1).max(200)).max(8).default([]),
    normalize: z.enum(["loose", "standard", "exact"]).default("loose"),
    reveal: z.string().max(4000).default(""),
  })
  .strict();
const Config = z
  .object({
    steps: z.array(Step).min(1).max(8),
    /** Encodings of the answer that are intentionally visible in prompts (declared for the leak scanner). */
    intentional: z.array(z.enum(["caesar", "rot13", "atbash", "reverse", "b64", "hex", "morse", "base32"])).default([]),
  })
  .strict();
type C = z.infer<typeof Config>;

const Action = z.object({ type: z.literal("answer"), value: z.string().min(1).max(300) }).strict();
type A = z.infer<typeof Action>;

interface Pub {
  steps: { prompt: string; reveal: string }[];
}
interface Sec {
  answers: { accept: string[]; normalize: "loose" | "standard" | "exact" }[];
}

function currentStep(solvedSteps: number, total: number) {
  return Math.min(solvedSteps, total - 1);
}

export const cryptic: ChallengePrimitive<C, Pub, Sec, A> = {
  id: "cryptic",
  version: "1.0.0",
  family: "cryptic",
  label: "Cryptic puzzle",
  summary: "Sequential multi-clue puzzle with per-team answers derived from world facts.",
  schema: Config,
  actionSchema: Action,
  example: () => ({
    steps: [
      { prompt: "The first word of the transmission, shifted three places back: `{{codeword | caesar:3}}`", answer: "{{codeword}}", reveal: "The codeword opens the relay log." },
    ],
    intentional: ["caesar"],
  }),
  createInstance(config, ctx): Instance<Pub, Sec> {
    const steps = config.steps.map((s) => ({
      prompt: renderString(s.prompt, ctx.facts),
      reveal: renderString(s.reveal, ctx.facts),
      accept: [s.answer, ...s.alternates].map((a) => renderString(a, ctx.facts)),
      normalize: s.normalize,
    }));
    const outputs: Record<string, string> = {};
    steps.forEach((s, i) => (outputs[`step${i + 1}`] = s.accept[0]!));
    outputs.answer = steps.at(-1)!.accept[0]!;
    return {
      public: { steps: steps.map((s) => ({ prompt: s.prompt, reveal: s.reveal })) },
      secret: { answers: steps.map((s) => ({ accept: s.accept, normalize: s.normalize })) },
      outputs,
      guarded: steps.flatMap((s) => s.accept),
      intentional: config.intentional,
    };
  },
  view(inst, node) {
    const done = Number(node?.steps["solvedSteps"] ?? 0);
    const total = inst.public.steps.length;
    return {
      kind: "cryptic",
      total,
      solvedSteps: done,
      // Only the current step's prompt and the reveals of solved steps are shown.
      steps: inst.public.steps.slice(0, Math.min(total, done + 1)).map((s, i) => ({ index: i, prompt: s.prompt, reveal: i < done ? s.reveal : null, solved: i < done })),
    };
  },
  validateAction: () => ({ ok: true }),
  applyAction(action, inst, node): Transition {
    const total = inst.secret.answers.length;
    const done = Number(node?.steps["solvedSteps"] ?? 0);
    const idx = currentStep(done, total);
    const target = inst.secret.answers[idx]!;
    const ok = answerMatches(action.value, target.accept, target.normalize);
    if (!ok) {
      return {
        events: [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
        correct: false,
        submission: action.value.slice(0, 120),
        feedback: { tone: "fail", title: "ACCESS DENIED", message: `Clue ${idx + 1} of ${total} does not resolve to that.` },
      };
    }
    const next = idx + 1;
    const solved = next >= total;
    return {
      events: [{ type: "node.step", node: "", key: "solvedSteps", value: next }],
      solved,
      correct: true,
      feedback: solved
        ? { tone: "success", title: "ACCESS GRANTED", message: inst.public.steps[idx]!.reveal || undefined }
        : { tone: "partial", title: `CLUE ${idx + 1} RESOLVED`, message: inst.public.steps[idx]!.reveal || `Clue ${next + 1} of ${total} is now visible.` },
    };
  },
  intendedSolution: (inst) => inst.secret.answers.map((a) => ({ type: "answer" as const, value: a.accept[0]! })),
  isAttempt: () => true,
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 3,
      reasoningDifficulty: 3 + c.steps.length,
      interactionDepth: 1,
      statefulness: Math.min(6, c.steps.length * 1.5),
      instanceUniqueness: c.steps.some((s) => s.answer.includes("{{")) ? 7 : 0,
    }),
  describe: (c) => ({
    skills: ["lateral thinking", ...(c.intentional.length ? ["classical ciphers"] : [])],
    tools: c.intentional.length ? ["CyberChef or pen and paper"] : [],
    interaction: { channels: c.steps.length > 1 ? ["text", "state"] : ["text"], textExposure: c.intentional.length ? 0.9 : 0.6 },
  }),
  harden(c) {
    if (c.steps.length >= 8) return null;
    const last = c.steps.at(-1)!;
    const answerRef = /\{\{\s*([A-Za-z][\w.-]*)/.exec(last.answer)?.[1];
    if (!answerRef) return null;
    const extra = {
      prompt: `Before you can use the last result, prove you read it the long way round: \`{{${answerRef} | reverse | atbash}}\` must be turned back into the word you already hold.`,
      answer: last.answer,
      alternates: [],
      normalize: last.normalize,
      reveal: "Confirmed — the chain holds.",
    };
    return {
      config: { ...c, steps: [...c.steps, extra], intentional: [...new Set([...c.intentional, "reverse" as const, "atbash" as const])] },
      changes: [`Single-stage clue → ${c.steps.length + 1}-stage sequential clue`, "Final stage requires re-deriving the previous answer through a second transform"],
    };
  },
};
