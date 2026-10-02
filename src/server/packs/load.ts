import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isMap, isSeq, LineCounter, parseDocument, type Document } from "yaml";
import type { ZodType } from "zod";
import {
  ChallengeSchema,
  CheckpointsSchema,
  EventSchema,
  ID,
  StorySchema,
  type ChallengeDef,
  type AnyPack,
  type CheckpointDef,
  type EventDef,
  type PackDefV2,
  type StoryDef,
} from "./schema";
import { Blueprint, type BlueprintT } from "../game/core/blueprint";

export interface PackIssue {
  severity: "error" | "warning";
  file: string;
  line?: number;
  column?: number;
  path: string;
  message: string;
}

export interface PackLoadResult {
  pack: AnyPack | null;
  issues: PackIssue[];
}

type Key = string | number;

interface ParsedFile {
  rel: string;
  doc: Document;
  counter: LineCounter;
  data: unknown;
}

const MAX_FILE_BYTES = 512 * 1024;
const MAX_ASSET_BYTES = 15 * 1024 * 1024;

function locate(file: ParsedFile | undefined, p: Key[]): { line?: number; column?: number } {
  if (!file) return {};
  // Walk down the path as far as the YAML tree allows; report the deepest node found.
  let node: unknown = file.doc.contents;
  let best = node as { range?: [number, number, number] | null } | null | undefined;
  for (const key of p) {
    if (isMap(node)) {
      const pair = node.items.find((it) => {
        const k = (it.key as { value?: unknown } | null)?.value ?? it.key;
        return String(k) === String(key);
      });
      if (!pair) break;
      node = pair.value;
      best = (pair.value ?? pair.key) as typeof best;
    } else if (isSeq(node) && typeof key === "number") {
      node = node.items[key];
      if (!node) break;
      best = node as typeof best;
    } else break;
  }
  const offset = best?.range?.[0];
  if (offset === undefined) return {};
  const pos = file.counter.linePos(offset);
  return { line: pos.line, column: pos.col };
}

function fmtPath(p: Key[]) {
  return p.reduce<string>((acc, k) => (typeof k === "number" ? `${acc}[${k}]` : acc ? `${acc}.${k}` : String(k)), "");
}

async function readYaml(dir: string, rel: string, issues: PackIssue[]): Promise<ParsedFile | null> {
  const abs = path.join(dir, rel);
  let text: string;
  try {
    const stat = await fs.lstat(abs);
    if (!stat.isFile()) throw new Error("not a regular file");
    if (stat.size > MAX_FILE_BYTES) {
      issues.push({ severity: "error", file: rel, path: "", message: `file exceeds ${MAX_FILE_BYTES / 1024} KiB` });
      return null;
    }
    text = await fs.readFile(abs, "utf8");
  } catch {
    return null;
  }
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length) {
    for (const e of doc.errors) {
      const pos = e.linePos?.[0];
      issues.push({ severity: "error", file: rel, line: pos?.line, column: pos?.col, path: "", message: `YAML: ${e.message.split("\n")[0]}` });
    }
    return null;
  }
  return { rel, doc, counter, data: doc.toJS({ maxAliasCount: 20 }) };
}

function validate<T>(schema: ZodType<T>, file: ParsedFile, value: unknown, issues: PackIssue[], prefix: Key[] = []): T | null {
  const res = schema.safeParse(value);
  if (res.success) return res.data;
  for (const i of res.error.issues) {
    const p = [...prefix, ...(i.path as Key[])];
    issues.push({ severity: "error", file: file.rel, ...locate(file, p), path: fmtPath(p), message: i.message });
  }
  return null;
}

async function listFiles(root: string, sub: string): Promise<string[]> {
  const out: string[] = [];
  const base = path.join(root, sub);
  async function walk(d: string) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isSymbolicLink()) continue; // never follow links out of the pack
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  await walk(base);
  return out.sort();
}

/** Detects cycles in the challenge dependency graph (a cycle makes challenges unreachable). */
export function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    state.set(n, 1);
    stack.push(n);
    for (const m of graph.get(n) ?? []) {
      const s = state.get(m) ?? 0;
      if (s === 1) return [...stack.slice(stack.indexOf(m)), m];
      if (s === 0) {
        const c = visit(m);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of graph.keys()) {
    if ((state.get(n) ?? 0) === 0) {
      const c = visit(n);
      if (c) return c;
    }
  }
  return null;
}

export async function loadPack(packsDir: string, slug: string): Promise<PackLoadResult> {
  const issues: PackIssue[] = [];
  if (!ID.safeParse(slug).success) {
    return { pack: null, issues: [{ severity: "error", file: "", path: "", message: `invalid pack slug "${slug}"` }] };
  }
  const dir = path.resolve(packsDir, slug);
  try {
    if (!(await fs.stat(dir)).isDirectory()) throw new Error();
  } catch {
    return { pack: null, issues: [{ severity: "error", file: dir, path: "", message: "pack directory not found" }] };
  }

  try {
    if ((await fs.stat(path.join(dir, "dossier.yaml"))).isFile()) return loadPackV2(dir, slug);
  } catch {
    /* not a v2 pack */
  }

  const files = new Map<string, ParsedFile>();
  const hash = createHash("sha256");

  // ── event.yaml ──
  const eventFile = await readYaml(dir, "event.yaml", issues);
  if (!eventFile) {
    if (!issues.some((i) => i.file === "event.yaml")) issues.push({ severity: "error", file: "event.yaml", path: "", message: "event.yaml is required" });
    return { pack: null, issues };
  }
  files.set("event.yaml", eventFile);
  const event = validate(EventSchema, eventFile, eventFile.data, issues) as EventDef | null;
  if (event && event.id !== slug) {
    issues.push({ severity: "error", file: "event.yaml", ...locate(eventFile, ["id"]), path: "id", message: `id "${event.id}" must match the pack folder name "${slug}"` });
  }

  // ── story.yaml (optional unless inquest is enabled) ──
  const storyFile = await readYaml(dir, "story.yaml", issues);
  let story: StoryDef | null = null;
  if (storyFile) {
    files.set("story.yaml", storyFile);
    story = validate(StorySchema, storyFile, storyFile.data, issues) as StoryDef | null;
  } else if (event?.modes.includes("inquest") && !issues.some((i) => i.file === "story.yaml")) {
    issues.push({ severity: "error", file: "story.yaml", path: "", message: "story.yaml is required when the inquest mode is enabled" });
  }

  // ── checkpoints.yaml ──
  const cpFile = await readYaml(dir, "checkpoints.yaml", issues);
  let checkpoints: CheckpointDef[] = [];
  if (cpFile) {
    files.set("checkpoints.yaml", cpFile);
    checkpoints = (validate(CheckpointsSchema, cpFile, cpFile.data, issues)?.checkpoints ?? []) as CheckpointDef[];
  }

  // ── challenges/*.yaml ──
  const challengeFiles = (await listFiles(dir, "challenges")).filter((f) => /\.ya?ml$/.test(f));
  const challenges: (ChallengeDef & { sourceFile: string })[] = [];
  const challengeLoc = new Map<string, { file: ParsedFile; prefix: Key[] }>();
  for (const rel of challengeFiles) {
    const f = await readYaml(dir, rel, issues);
    if (!f) continue;
    files.set(rel, f);
    const data = f.data as Record<string, unknown> | null;
    const list: { value: unknown; prefix: Key[] }[] =
      data && typeof data === "object" && Array.isArray((data as { challenges?: unknown }).challenges)
        ? ((data as { challenges: unknown[] }).challenges.map((value, i) => ({ value, prefix: ["challenges", i] })))
        : [{ value: data, prefix: [] }];
    for (const { value, prefix } of list) {
      const c = validate(ChallengeSchema, f, value, issues, prefix) as ChallengeDef | null;
      if (!c) continue;
      if (challengeLoc.has(c.id)) {
        issues.push({ severity: "error", file: rel, ...locate(f, [...prefix, "id"]), path: fmtPath([...prefix, "id"]), message: `duplicate challenge id "${c.id}"` });
        continue;
      }
      challengeLoc.set(c.id, { file: f, prefix });
      challenges.push({ ...c, sourceFile: rel });
    }
  }

  // ── assets ──
  const assets = await listFiles(dir, "assets");
  for (const a of assets) {
    const st = await fs.stat(path.join(dir, a));
    if (st.size > MAX_ASSET_BYTES) issues.push({ severity: "error", file: a, path: "", message: "asset exceeds 15 MiB" });
  }
  const assetSet = new Set(assets);

  // ── cross-reference validation ──
  const err = (file: ParsedFile | undefined, p: Key[], message: string, severity: "error" | "warning" = "error") =>
    issues.push({ severity, file: file?.rel ?? "", ...locate(file, p), path: fmtPath(p), message });

  const byId = new Map(challenges.map((c) => [c.id, c]));
  const evidenceIds = new Set(story?.evidence.map((e) => e.id) ?? []);
  const graph = new Map<string, string[]>();

  if (event) {
    const cats = new Set(event.ctf.categories.map((c) => c.id));
    if (event.theme.logo && !assetSet.has(event.theme.logo)) err(eventFile, ["theme", "logo"], `asset not found: ${event.theme.logo}`);
    for (const c of challenges) {
      const loc = challengeLoc.get(c.id)!;
      const at = (...k: Key[]) => [...loc.prefix, ...k];
      if (!event.modes.includes(c.mode)) err(loc.file, at("mode"), `mode "${c.mode}" is not enabled in event.yaml modes`);
      if (c.mode === "ctf" && c.category && !cats.has(c.category)) err(loc.file, at("category"), `unknown ctf category "${c.category}" (declare it in event.yaml ctf.categories)`);
      const deps = [...(c.requires?.all ?? []), ...(c.requires?.any ?? [])];
      graph.set(c.id, deps);
      deps.forEach((d, i) => {
        if (d === c.id) err(loc.file, at("requires"), "a challenge cannot require itself");
        else if (!byId.has(d)) err(loc.file, at("requires", i), `requires unknown challenge "${d}"`);
      });
      c.reveals.forEach((r, i) => {
        if (!evidenceIds.has(r)) err(loc.file, at("reveals", i), `reveals unknown evidence "${r}"`);
      });
      c.assets.forEach((a, i) => {
        if (!assetSet.has(a)) err(loc.file, at("assets", i), `asset not found: ${a}`);
      });
      if (c.available_from && event.ends_at && c.available_from > event.ends_at)
        err(loc.file, at("available_from"), "available_from is after the event ends", "warning");
    }
    const cycle = findCycle(graph);
    if (cycle) {
      const first = challengeLoc.get(cycle[0]!);
      err(first?.file, [...(first?.prefix ?? []), "requires"], `dependency cycle: ${cycle.join(" → ")}`);
    }
    for (const m of ["hunt", "ctf", "inquest"] as const) {
      if (event.modes.includes(m) && m !== "inquest" && !challenges.some((c) => c.mode === m))
        err(eventFile, ["modes"], `mode "${m}" is enabled but the pack has no ${m} challenges`, "warning");
    }
    if (event.modes.includes("live") && checkpoints.length === 0)
      err(eventFile, ["modes"], "mode \"live\" is enabled but checkpoints.yaml defines no checkpoints", "error");
    if (!event.modes.includes("live") && checkpoints.length > 0)
      err(cpFile ?? undefined, ["checkpoints"], "checkpoints are defined but the \"live\" mode is not enabled", "warning");
  }

  if (story && storyFile) {
    const dup = <T extends { id: string }>(list: T[], key: string) => {
      const seen = new Set<string>();
      list.forEach((x, i) => {
        if (seen.has(x.id)) err(storyFile, [key, i, "id"], `duplicate ${key} id "${x.id}"`);
        seen.add(x.id);
      });
      return seen;
    };
    const suspects = dup(story.suspects, "suspects");
    const locations = dup(story.locations, "locations");
    dup(story.evidence, "evidence");
    const checkAsset = (p: Key[], a?: string) => a && !assetSet.has(a) && err(storyFile, p, `asset not found: ${a}`);
    checkAsset(["victim", "image"], story.victim.image);
    story.suspects.forEach((s, i) => checkAsset(["suspects", i, "image"], s.image));
    story.locations.forEach((l, i) => checkAsset(["locations", i, "image"], l.image));
    story.evidence.forEach((e, i) => {
      checkAsset(["evidence", i, "image"], e.image);
      if (e.location && !locations.has(e.location)) err(storyFile, ["evidence", i, "location"], `unknown location "${e.location}"`);
      e.suspects.forEach((s, j) => !suspects.has(s) && err(storyFile, ["evidence", i, "suspects", j], `unknown suspect "${s}"`));
      if ("after_challenge" in e.reveal && !byId.has(e.reveal.after_challenge))
        err(storyFile, ["evidence", i, "reveal", "after_challenge"], `unknown challenge "${e.reveal.after_challenge}"`);
    });
    story.timeline.forEach((t, i) => {
      if (t.requires_evidence && !evidenceIds.has(t.requires_evidence)) err(storyFile, ["timeline", i, "requires_evidence"], `unknown evidence "${t.requires_evidence}"`);
    });
    const acc = story.accusation;
    const fieldIds = new Set<string>();
    acc.fields.forEach((f, i) => {
      if (fieldIds.has(f.id)) err(storyFile, ["accusation", "fields", i, "id"], `duplicate field id "${f.id}"`);
      fieldIds.add(f.id);
      const sol = acc.solution[f.id];
      if (!sol) return err(storyFile, ["accusation", "solution"], `solution is missing a value for field "${f.id}"`);
      const valid =
        f.type === "suspect" ? suspects : f.type === "location" ? locations : f.type === "evidence" ? evidenceIds : new Set(f.options.map((o) => o.id));
      if (f.type === "choice" && f.options.length < 2) err(storyFile, ["accusation", "fields", i, "options"], "choice fields need at least two options");
      if (!valid.has(sol)) err(storyFile, ["accusation", "solution", f.id], `"${sol}" is not a valid ${f.type} for field "${f.id}"`);
    });
    for (const k of Object.keys(acc.solution)) if (!fieldIds.has(k)) err(storyFile, ["accusation", "solution", k], `solution references unknown field "${k}"`);
    if (event && !event.modes.includes("inquest")) err(storyFile, [], "story.yaml is present but the \"inquest\" mode is not enabled", "warning");
  }

  if (cpFile) {
    const seen = new Set<string>();
    checkpoints.forEach((c, i) => {
      if (seen.has(c.id)) err(cpFile, ["checkpoints", i, "id"], `duplicate checkpoint id "${c.id}"`);
      seen.add(c.id);
      if (c.requires_approval && !c.pin) err(cpFile, ["checkpoints", i], "no station PIN: volunteers must sign in with a staff account to approve", "warning");
    });
  }

  // Deterministic content hash (files + assets) for change detection.
  for (const rel of [...files.keys()].sort()) hash.update(rel).update(await fs.readFile(path.join(dir, rel)));
  for (const a of assets) hash.update(a).update(await fs.readFile(path.join(dir, a)));

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors || !event) return { pack: null, issues };
  return {
    pack: { format: "v1", slug, dir, event, story, challenges, checkpoints, assets, hash: hash.digest("hex").slice(0, 16) },
    issues,
  };
}

/** v2 pack: dossier.yaml is a blueprint; story/*.md are the narrative sources it was compiled from. */
async function loadPackV2(dir: string, slug: string): Promise<PackLoadResult> {
  const issues: PackIssue[] = [];
  const file = await readYaml(dir, "dossier.yaml", issues);
  if (!file) return { pack: null, issues: issues.length ? issues : [{ severity: "error", file: "dossier.yaml", path: "", message: "cannot read dossier.yaml" }] };
  const bp = validate(Blueprint, file, file.data, issues) as BlueprintT | null;
  if (bp && bp.event.id !== slug) issues.push({ severity: "error", file: "dossier.yaml", ...locate(file, ["event", "id"]), path: "event.id", message: `id "${bp.event.id}" must match the pack folder name "${slug}"` });
  const sources: { name: string; markdown: string }[] = [];
  for (const rel of (await listFiles(dir, "story")).filter((f) => f.endsWith(".md"))) {
    const st = await fs.stat(path.join(dir, rel));
    if (st.size > MAX_FILE_BYTES) issues.push({ severity: "error", file: rel, path: "", message: "file too large" });
    else sources.push({ name: rel.replace(/^story\//, ""), markdown: await fs.readFile(path.join(dir, rel), "utf8") });
  }
  const assets = await listFiles(dir, "assets");
  const hash = createHash("sha256").update(await fs.readFile(path.join(dir, "dossier.yaml")));
  for (const s of sources) hash.update(s.name).update(s.markdown);
  for (const a of assets) hash.update(a).update(await fs.readFile(path.join(dir, a)));
  if (!bp || issues.some((i) => i.severity === "error")) return { pack: null, issues };
  const pack: PackDefV2 = { format: "v2", slug, dir, blueprint: bp, sources, assets, hash: hash.digest("hex").slice(0, 16) };
  return { pack, issues };
}

export async function listPacks(packsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(packsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && ID.safeParse(e.name).success).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export function formatIssue(i: PackIssue): string {
  const where = [i.file, i.line !== undefined ? `${i.line}:${i.column ?? 1}` : null].filter(Boolean).join(":");
  return `${i.severity === "error" ? "✖" : "⚠"} ${where}${i.path ? ` (${i.path})` : ""} — ${i.message}`;
}

/** Format-agnostic summary for listings. */
export function packSummary(pack: AnyPack): { name: string; format: "v1" | "v2"; nodes: number; checkpoints: number; families: string[]; hasStory: boolean } {
  if (pack.format === "v2")
    return {
      name: pack.blueprint.event.title,
      format: "v2",
      nodes: pack.blueprint.nodes.length,
      checkpoints: pack.blueprint.checkpoints.length,
      families: [...new Set(pack.blueprint.rounds.map((r) => r.family))],
      hasStory: pack.blueprint.story.characters.length > 0,
    };
  return { name: pack.event.name, format: "v1", nodes: pack.challenges.length, checkpoints: pack.checkpoints.length, families: [...new Set(pack.challenges.map((c) => c.mode))], hasStory: Boolean(pack.story) };
}
