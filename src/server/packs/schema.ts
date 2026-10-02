import { z } from "zod";
import type { BlueprintT } from "../game/core/blueprint";

/**
 * Content-pack schema. Everything event-specific (names, stories, answers,
 * theme) lives in ./packs/<slug>/ and is validated here. The engine never
 * hardcodes fest content.
 */

export const ID = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "ids are lowercase letters, digits and dashes (max 63 chars), starting with a letter or digit");

const Timestamp = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "not a valid ISO-8601 timestamp (e.g. 2026-10-10T10:00:00+05:30)" });
      return z.NEVER;
    }
    return d.toISOString();
  });

const AssetPath = z
  .string()
  .regex(/^assets\/[A-Za-z0-9._\-/]+$/, "asset paths must look like assets/<file> (letters, digits, . _ - /)")
  .refine((p) => !p.split("/").some((seg) => seg === ".." || seg === "." || seg === ""), "asset paths may not contain '.', '..' or empty segments");

const Markdown = z.string().max(20_000, "markdown blocks are limited to 20k characters");

export const SignalColor = z.enum(["green", "cyan", "magenta", "amber"]);
export const Mode = z.enum(["hunt", "ctf", "inquest", "live"]);

export const EventSchema = z
  .object({
    id: ID,
    name: z.string().min(1).max(80),
    tagline: z.string().max(160).default(""),
    organizer: z.string().max(120).default(""),
    timezone: z.string().default("UTC"),
    starts_at: Timestamp.optional(),
    ends_at: Timestamp.optional(),
    modes: z.array(Mode).min(1, "enable at least one mode"),
    registration: z
      .object({
        open: z.boolean().default(true),
        code: z.string().min(4).max(64).optional(),
        min_members: z.number().int().min(1).max(12).default(1),
        max_members: z.number().int().min(1).max(12).default(4),
      })
      .strict()
      .default({ open: true, min_members: 1, max_members: 4 }),
    scoring: z
      .object({
        freeze_at: Timestamp.optional(),
        stuck_after_minutes: z.number().int().min(5).max(600).default(30),
      })
      .strict()
      .default({ stuck_after_minutes: 30 }),
    rules_md: Markdown.default(""),
    theme: z
      .object({
        accent: SignalColor.default("green"),
        secondary: SignalColor.default("cyan"),
        logo: AssetPath.optional(),
        boot_lines: z.array(z.string().max(80)).max(8).default([]),
        codename: z.string().max(40).optional(),
      })
      .strict()
      .default({ accent: "green", secondary: "cyan", boot_lines: [] }),
    ctf: z
      .object({
        categories: z
          .array(z.object({ id: ID, name: z.string().min(1).max(40), description: z.string().max(200).default("") }).strict())
          .default([]),
      })
      .strict()
      .default({ categories: [] }),
    hunt: z
      .object({
        title: z.string().max(60).default("Hunt"),
        intro_md: Markdown.default(""),
      })
      .strict()
      .default({ title: "Hunt", intro_md: "" }),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.starts_at && e.ends_at && e.starts_at >= e.ends_at) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
    }
    if (e.registration.min_members > e.registration.max_members) {
      ctx.addIssue({ code: "custom", path: ["registration", "min_members"], message: "min_members cannot exceed max_members" });
    }
  });

const Requires = z.union([
  z.array(ID).transform((all) => ({ all, any: [] as string[] })),
  z
    .object({ all: z.array(ID).default([]), any: z.array(ID).default([]) })
    .strict()
    .refine((r) => r.all.length + r.any.length > 0, "requires must list at least one challenge"),
]);

const Answer = z
  .object({
    type: z.enum(["text", "flag", "number"]).default("text"),
    normalize: z.enum(["loose", "standard", "exact"]).optional(),
    accept: z.array(z.union([z.string().min(1).max(500), z.number()]).transform(String)).default([]),
    accept_hashes: z.array(z.object({ salt: z.string().min(8), hash: z.string().min(20) }).strict()).default([]),
  })
  .strict()
  .refine((a) => a.accept.length + a.accept_hashes.length > 0, "an answer needs at least one accepted value");

const Scoring = z.discriminatedUnion("type", [
  z.object({ type: z.literal("static") }).strict(),
  z
    .object({
      type: z.literal("dynamic"),
      initial: z.number().int().min(1).max(100_000),
      minimum: z.number().int().min(0).max(100_000),
      decay: z.number().int().min(1).max(10_000).describe("solves until the value reaches minimum"),
    })
    .strict()
    .refine((s) => s.minimum <= s.initial, { message: "minimum must be ≤ initial", path: ["minimum"] }),
]);

export const ChallengeSchema = z
  .object({
    id: ID,
    mode: z.enum(["hunt", "ctf", "inquest"]),
    title: z.string().min(1).max(100),
    category: ID.optional(),
    body: Markdown.default(""),
    points: z.number().int().min(0).max(100_000).default(100),
    scoring: Scoring.default({ type: "static" }),
    first_blood_bonus: z.number().int().min(0).max(10_000).default(0),
    answer: Answer,
    hints: z.array(z.object({ cost: z.number().int().min(0).max(10_000), text: Markdown.min(1) }).strict()).max(10).default([]),
    requires: Requires.optional(),
    available_from: Timestamp.optional(),
    assets: z.array(AssetPath).max(20).default([]),
    position: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict().optional(),
    reveals: z.array(ID).default([]),
    order: z.number().int().default(0),
    tags: z.array(z.string().max(24)).max(8).default([]),
    difficulty: z.enum(["easy", "medium", "hard", "insane"]).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.mode === "ctf" && !c.category) ctx.addIssue({ code: "custom", path: ["category"], message: "ctf challenges need a category" });
    if (c.mode !== "ctf" && c.scoring.type === "dynamic")
      ctx.addIssue({ code: "custom", path: ["scoring"], message: "dynamic scoring is only supported for ctf challenges" });
    if (c.scoring.type === "dynamic" && c.points !== 100 && c.points !== c.scoring.initial)
      ctx.addIssue({ code: "custom", path: ["points"], message: "for dynamic scoring set scoring.initial, not points" });
    if (c.mode !== "inquest" && c.reveals.length > 0)
      ctx.addIssue({ code: "custom", path: ["reveals"], message: "only inquest challenges can reveal evidence" });
  });

export const ChallengeFileSchema = z.union([z.object({ challenges: z.array(z.unknown()).min(1) }).strict(), z.record(z.string(), z.unknown())]);

const Reveal = z.union([
  z.object({ at_start: z.literal(true) }).strict(),
  z.object({ visible_from: Timestamp }).strict(),
  z.object({ after_challenge: ID }).strict(),
]);

export const StorySchema = z
  .object({
    case: z
      .object({
        title: z.string().min(1).max(100),
        codename: z.string().max(40).default(""),
        summary: z.string().max(400).default(""),
      })
      .strict(),
    briefing: Markdown.default(""),
    victim: z
      .object({
        name: z.string().min(1).max(80),
        details: z.array(z.object({ label: z.string().max(30), value: z.string().max(120) }).strict()).default([]),
        body: Markdown.default(""),
        image: AssetPath.optional(),
      })
      .strict(),
    locations: z
      .array(z.object({ id: ID, name: z.string().min(1).max(80), body: Markdown.default(""), image: AssetPath.optional() }).strict())
      .default([]),
    suspects: z
      .array(
        z
          .object({
            id: ID,
            name: z.string().min(1).max(80),
            role: z.string().max(80).default(""),
            details: z.array(z.object({ label: z.string().max(30), value: z.string().max(120) }).strict()).default([]),
            body: Markdown.default(""),
            image: AssetPath.optional(),
          })
          .strict(),
      )
      .min(2, "an inquest needs at least two suspects"),
    evidence: z
      .array(
        z
          .object({
            id: ID,
            title: z.string().min(1).max(100),
            kind: z.enum(["document", "photo", "testimony", "object", "record", "audio"]).default("document"),
            summary: z.string().max(240).default(""),
            body: Markdown.default(""),
            image: AssetPath.optional(),
            location: ID.optional(),
            suspects: z.array(ID).default([]),
            reveal: Reveal.default({ at_start: true }),
          })
          .strict(),
      )
      .min(1),
    timeline: z
      .array(
        z
          .object({
            at: z.string().min(1).max(40),
            title: z.string().min(1).max(100),
            body: z.string().max(600).default(""),
            requires_evidence: ID.optional(),
          })
          .strict(),
      )
      .default([]),
    accusation: z
      .object({
        max_attempts: z.number().int().min(1).max(10).default(3),
        penalties: z.array(z.number().int().min(0).max(10_000)).min(1).default([0, 50, 100]),
        fields: z
          .array(
            z
              .object({
                id: ID,
                label: z.string().min(1).max(80),
                type: z.enum(["suspect", "choice", "location", "evidence"]),
                options: z.array(z.object({ id: ID, label: z.string().min(1).max(80) }).strict()).default([]),
                points: z.number().int().min(0).max(100_000),
              })
              .strict(),
          )
          .min(1),
        solution: z.record(ID, ID),
        solution_md: Markdown.default(""),
      })
      .strict(),
  })
  .strict();

export const CheckpointsSchema = z
  .object({
    checkpoints: z
      .array(
        z
          .object({
            id: ID,
            name: z.string().min(1).max(80),
            location: z.string().max(120).default(""),
            instructions: Markdown.default(""),
            points: z.number().int().min(0).max(100_000).default(50),
            requires_approval: z.boolean().default(true),
            pin: z
              .union([z.string(), z.number()])
              .transform(String)
              .pipe(z.string().regex(/^\d{4,8}$/, "station PINs are 4–8 digits"))
              .optional(),
            order: z.number().int().default(0),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type EventDef = z.infer<typeof EventSchema>;
export type ChallengeDef = z.infer<typeof ChallengeSchema>;
export type StoryDef = z.infer<typeof StorySchema>;
export type CheckpointDef = z.infer<typeof CheckpointsSchema>["checkpoints"][number];

/** A v1 pack: event.yaml + challenges/*.yaml + story.yaml + checkpoints.yaml (converted to a blueprint on import). */
export interface PackDef {
  format: "v1";
  slug: string;
  dir: string;
  event: EventDef;
  story: StoryDef | null;
  challenges: (ChallengeDef & { sourceFile: string })[];
  checkpoints: CheckpointDef[];
  assets: string[];
  hash: string;
}

/** A v2 pack: dossier.yaml (a blueprint) + optional story/*.md sources + assets/. */
export interface PackDefV2 {
  format: "v2";
  slug: string;
  dir: string;
  blueprint: BlueprintT;
  sources: { name: string; markdown: string }[];
  assets: string[];
  hash: string;
}

export type AnyPack = PackDef | PackDefV2;
