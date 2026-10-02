import { z } from "zod";
import { profile } from "../core/difficulty";
import { render } from "../core/template";
import { GitRepo } from "../artifacts/git";
import { buildZip } from "../artifacts/zip";
import type { ChallengePrimitive } from "./types";
import { AnswerAction, AnswerBlock, answerOutputs, checkAnswerTransition, resolveAnswer, type AnswerActionT, type AnswerSecret } from "./common";

/**
 * A genuine Git repository generated from a declarative history script:
 * commits (with deletions), branches, annotated tags, and resets that leave
 * a commit dangling (reachable only through the reflog / fsck). Delivered as
 * a zip containing a working tree and its `.git` directory.
 */
const Person = z.object({ name: z.string().max(80), email: z.string().max(120) }).strict();
const Step = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("commit"),
      label: z.string().max(40).optional(),
      branch: z.string().regex(/^[A-Za-z0-9._/-]{1,60}$/).default("main"),
      author: z.number().int().min(0).default(0),
      message: z.string().min(1).max(2000),
      date: z.string().max(80),
      tz: z.string().regex(/^[+-]\d{4}$/).default("+0000"),
      changes: z.record(z.string().regex(/^[A-Za-z0-9._/-]{1,120}$/), z.string().max(20_000).nullable()),
    })
    .strict(),
  z.object({ op: z.literal("branch"), name: z.string().regex(/^[A-Za-z0-9._/-]{1,60}$/), at: z.string().max(40) }).strict(),
  z.object({ op: z.literal("tag"), name: z.string().regex(/^[A-Za-z0-9._/-]{1,60}$/), at: z.string().max(40), message: z.string().max(1000).optional(), author: z.number().int().min(0).default(0), date: z.string().max(80).optional() }).strict(),
  z.object({ op: z.literal("reset"), branch: z.string().max(60), to: z.string().max(40), author: z.number().int().min(0).default(0), date: z.string().max(80) }).strict(),
  z.object({ op: z.literal("checkout"), branch: z.string().max(60) }).strict(),
]);

const Config = z
  .object({
    ...AnswerBlock,
    repo: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/).default("project"),
    people: z.array(Person).min(1).max(10),
    history: z.array(Step).min(1).max(60),
  })
  .strict()
  .superRefine((c, ctx) => {
    const labels = new Set<string>();
    c.history.forEach((s, i) => {
      if (s.op === "commit" && s.label) labels.add(s.label);
      const ref = s.op === "branch" || s.op === "tag" ? s.at : s.op === "reset" ? s.to : null;
      if (ref && !labels.has(ref)) ctx.addIssue({ code: "custom", path: ["history", i], message: `unknown commit label "${ref}" (labels must be defined earlier)` });
      if ("author" in s && s.author >= c.people.length) ctx.addIssue({ code: "custom", path: ["history", i, "author"], message: "author index out of range" });
    });
  });
type C = z.infer<typeof Config>;

export function buildRepo(c: C): { repo: GitRepo; labels: Map<string, string> } {
  const repo = new GitRepo("main");
  const labels = new Map<string, string>();
  for (const s of c.history) {
    switch (s.op) {
      case "commit": {
        const sha = repo.commit(s.branch, { message: s.message, author: c.people[s.author]!, date: new Date(s.date), tz: s.tz, changes: s.changes });
        if (s.label) labels.set(s.label, sha);
        break;
      }
      case "branch":
        repo.branch(s.name, labels.get(s.at)!);
        break;
      case "tag":
        repo.tag(s.name, labels.get(s.at)!, s.message ? { message: s.message, tagger: c.people[s.author]!, date: new Date(s.date ?? "2026-01-01T00:00:00Z") } : undefined);
        break;
      case "reset":
        repo.reset(s.branch, labels.get(s.to)!, c.people[s.author]!, new Date(s.date));
        break;
      case "checkout":
        repo.checkout(s.branch);
        break;
    }
  }
  return { repo, labels };
}

export const gitForensics: ChallengePrimitive<C, { question: string; answerFormat: string; repo: string }, AnswerSecret & { rendered: C }, AnswerActionT> = {
  id: "git-forensics",
  version: "1.0.0",
  family: "ctf",
  label: "Git history forensics",
  summary: "A real repository whose evidence lives in history: deleted files, other branches, annotated tags, and commits only reachable via the reflog.",
  schema: Config,
  actionSchema: AnswerAction,
  example: () => ({
    question: "What was in the file that was deleted before the audit?",
    answer: "{{codeword}}",
    people: [{ name: "Dev One", email: "dev@example.edu" }],
    history: [
      { op: "commit", label: "init", message: "initial import", date: "2026-03-01T10:00:00Z", changes: { "README.md": "# project\n", "config/key.txt": "{{codeword}}\n" } },
      { op: "commit", label: "clean", message: "remove debug config", date: "2026-03-02T10:00:00Z", changes: { "config/key.txt": null } },
    ],
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    for (const s of rendered.history) if ((s.op === "commit" || s.op === "reset") && Number.isNaN(Date.parse(s.date))) throw new Error(`git history: date "${s.date}" is not ISO-8601 after templating`);
    const secret = { ...resolveAnswer(config, ctx.facts), rendered };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat, repo: rendered.repo }, secret, ...answerOutputs(secret) };
  },
  view: (inst) => ({ kind: "artifact", question: inst.public.question, answerFormat: inst.public.answerFormat }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  artifacts(inst) {
    const c = inst.secret.rendered;
    return [
      {
        name: `${c.repo}.zip`,
        mime: "application/zip",
        description: "Repository snapshot (working tree + .git)",
        build: () => buildZip(buildRepo(c).repo.files(c.repo).map((f) => ({ name: f.name, data: f.data, store: true }))),
      },
    ];
  },
  difficulty: (c) => {
    const ops = new Set(c.history.map((s) => s.op));
    const deletes = c.history.some((s) => s.op === "commit" && Object.values(s.changes).includes(null));
    return profile({
      knowledgeDifficulty: 5 + (deletes ? 1 : 0),
      reasoningDifficulty: 4 + (ops.has("reset") ? 2 : 0),
      toolRequirement: 7,
      interactionDepth: 4 + (ops.has("branch") ? 1 : 0) + (ops.has("tag") ? 1 : 0) + (ops.has("reset") ? 2 : 0),
      statefulness: 3,
      crossModalComplexity: 3,
      redHerringDensity: Math.min(8, c.history.length / 3),
      instanceUniqueness: JSON.stringify(c.history).includes("{{") ? 8 : 1,
    });
  },
  describe: (c) => ({
    skills: ["git history", ...(c.history.some((s) => s.op === "reset") ? ["reflog / dangling objects"] : []), ...(c.history.some((s) => s.op === "branch") ? ["branches"] : [])],
    tools: ["git log --all", "git show", ...(c.history.some((s) => s.op === "reset") ? ["git reflog / git fsck --lost-found"] : [])],
    interaction: { channels: ["file", "terminal"], textExposure: 0.02 },
  }),
};
