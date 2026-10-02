import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveAssetFile, ASSET_TYPES } from "../../assets/sign";
import { profile } from "../core/difficulty";
import { checkAnswer, type AnswerHash } from "../../security/answers";
import { env } from "../../env";
import type { ChallengePrimitive, Transition } from "./types";
import { attempts } from "./types";

/**
 * The simplest primitive: a briefing and a pre-hashed accepted answer. This is
 * what v1 hunt/CTF/inquest challenges become. Answers are stored only as
 * HMAC hashes (hashed at import / Studio save).
 */
const Config = z
  .object({
    answer: z
      .object({
        type: z.enum(["text", "flag", "number"]).default("text"),
        normalize: z.enum(["loose", "standard", "exact"]).default("loose"),
        hashes: z.array(z.object({ salt: z.string().min(8), hash: z.string().min(20) }).strict()).default([]),
        /** Plaintext answers are accepted in packs/Studio input and hashed before storage. */
        accept: z.array(z.string().min(1).max(500)).optional(),
      })
      .strict(),
    /** Encodings of the answer that are the puzzle itself (declared for the leak scanner). */
    intentional: z.array(z.enum(["plain", "caesar", "rot13", "atbash", "reverse", "b64", "hex", "morse", "base32"])).default([]),
    /** Static attachments from the pack's assets/ folder (v1 packs). */
    files: z.array(z.string().regex(/^assets\/[A-Za-z0-9._\-/]+$/)).max(20).default([]),
  })
  .strict();
type C = z.infer<typeof Config>;

const Action = z.object({ type: z.literal("answer"), value: z.string().min(1).max(500) }).strict();
type A = z.infer<typeof Action>;

interface Sec {
  hashes: AnswerHash[];
  type: C["answer"]["type"];
  normalize: C["answer"]["normalize"];
  files: string[];
  eventId: string;
}

export const staticAnswer: ChallengePrimitive<C, { answerType: string }, Sec, A> = {
  id: "static-answer",
  version: "1.0.0",
  family: "custom",
  label: "Static answer",
  summary: "A briefing with one pre-hashed accepted answer. Identical for every team — prefer generated primitives for competitive rounds.",
  schema: Config,
  actionSchema: Action,
  example: () => ({ answer: { type: "text", normalize: "loose", accept: ["example"] } }),
  createInstance(config, ctx) {
    return {
      public: { answerType: config.answer.type },
      secret: { hashes: config.answer.hashes, type: config.answer.type, normalize: config.answer.normalize, files: config.files, eventId: ctx.eventId },
      outputs: {},
      guarded: config.answer.accept ?? [],
      intentional: config.intentional,
    };
  },
  view: (inst) => ({ kind: "answer", answerType: inst.public.answerType }),
  validateAction: () => ({ ok: true }),
  applyAction(action, inst, node): Transition {
    const ok = checkAnswer(env().ANSWER_SECRET, action.value, inst.secret.type, inst.secret.normalize, inst.secret.hashes);
    return {
      events: ok ? [] : [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
      solved: ok,
      correct: ok,
      submission: action.value.slice(0, 120),
      feedback: ok ? { tone: "success", title: "ACCESS GRANTED" } : { tone: "fail", title: "ACCESS DENIED", message: "That does not check out." },
    };
  },
  intendedSolution: (inst) => (inst.guarded[0] ? [{ type: "answer", value: inst.guarded[0] }] : []),
  isAttempt: () => true,
  artifacts: (inst) =>
    inst.secret.files.map((f) => ({
      name: path.basename(f),
      mime: ASSET_TYPES[path.extname(f).toLowerCase()]?.type ?? "application/octet-stream",
      description: "Attachment",
      build: () => {
        const abs = resolveAssetFile(inst.secret.eventId, f);
        if (!abs) throw new Error("invalid asset path");
        return new Uint8Array(fs.readFileSync(abs));
      },
    })),
  difficulty: () => profile({ knowledgeDifficulty: 4, reasoningDifficulty: 3, interactionDepth: 1 }),
  describe: () => ({ skills: [], tools: [], interaction: { channels: ["text"], textExposure: 0.7 } }),
};
