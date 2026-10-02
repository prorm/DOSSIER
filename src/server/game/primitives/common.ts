import { z } from "zod";
import { renderString, type Facts } from "../core/template";
import type { Instance, Transition } from "./types";
import { answerMatches, attempts } from "./types";
import type { NodeState } from "../core/state";

/** Shared "question + templated answer" block used by artifact-based primitives. */
export const AnswerBlock = {
  question: z.string().min(1).max(600),
  answer: z.string().min(1).max(300),
  alternates: z.array(z.string().min(1).max(300)).max(8).default([]),
  normalize: z.enum(["loose", "standard", "exact"]).default("loose"),
  /** Shown to players, e.g. "HH:MM" or "KR-####". */
  answerFormat: z.string().max(80).default(""),
};

export interface AnswerSecret {
  accept: string[];
  normalize: "loose" | "standard" | "exact";
}

export function resolveAnswer(c: { answer: string; alternates: string[]; normalize: "loose" | "standard" | "exact" }, facts: Facts): AnswerSecret {
  return { accept: [c.answer, ...c.alternates].map((a) => renderString(a, facts)), normalize: c.normalize };
}

export const AnswerAction = z.object({ type: z.literal("answer"), value: z.string().min(1).max(300) }).strict();
export type AnswerActionT = z.infer<typeof AnswerAction>;

export function checkAnswerTransition(value: string, secret: AnswerSecret, node: NodeState | undefined, msgs: { ok?: string; fail?: string } = {}): Transition {
  const ok = answerMatches(value, secret.accept, secret.normalize);
  return {
    events: ok ? [] : [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
    solved: ok,
    correct: ok,
    submission: value.slice(0, 120),
    feedback: ok ? { tone: "success", title: "ACCESS GRANTED", message: msgs.ok } : { tone: "fail", title: "ACCESS DENIED", message: msgs.fail ?? "The evidence does not support that." },
  };
}

export function answerOutputs(secret: AnswerSecret): Pick<Instance, "outputs" | "guarded"> {
  return { outputs: { answer: secret.accept[0]! }, guarded: secret.accept };
}

/** Parses "YYYY-MM-DD" + "HH:MM[:SS]" + "+05:30" into a Date. */
export function localDate(date: string, time: string, tz = "+00:00"): Date {
  const t = /^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const [h, m, s] = t.split(":");
  return new Date(`${date}T${h!.padStart(2, "0")}:${m}:${s ?? "00"}${tz}`);
}
