import { createHmac, timingSafeEqual } from "node:crypto";
import type { ZodType } from "zod";
import type { BlueprintT, NodeDef } from "../core/blueprint";
import type { DifficultyProfile, InteractionProfile } from "../core/difficulty";
import type { Rng } from "../core/rng";
import type { GameState, NodeState, StateEventBody } from "../core/state";
import type { Facts } from "../core/template";

/**
 * The primitive contract. A primitive is trusted runtime code; authored and
 * generated content reaches it only as a config object validated by `schema`.
 * Everything a primitive does is deterministic given its config and `ctx.rng`.
 */

export interface InstanceContext {
  eventId: string;
  teamId: string;
  nodeId: string;
  node: NodeDef;
  blueprint: BlueprintT;
  /** World facts + upstream node outputs, already resolved for this team. */
  facts: Facts;
  rng: Rng;
}

export interface Instance<P = unknown, S = unknown> {
  /** Client-safe data (still filtered through `view`). */
  public: P;
  /** Server-only material: answers, fragments, truth tables. Never serialised to a client. */
  secret: S;
  /** Facts this node exports to downstream nodes (`answer` by convention). */
  outputs: Record<string, string>;
  /** Strings that must never reach a client in any recognisable form. */
  guarded: string[];
  /** Encodings of guarded strings that are intentionally visible (e.g. the ciphertext of a cipher puzzle). */
  /** "plain" = the answer necessarily appears verbatim in the evidence (OSINT pages, database rows); the challenge is identifying it. */
  intentional?: ("plain" | "caesar" | "rot13" | "atbash" | "reverse" | "b64" | "hex" | "morse" | "base32")[];
}

export interface Feedback {
  tone: "success" | "fail" | "info" | "partial";
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface Transition {
  /** Journal events besides node.solved (which the engine appends with rewards). */
  events: StateEventBody[];
  solved?: boolean;
  /** true/false for answer-like actions; null for exploratory actions (ask, query, evaluate…). */
  correct: boolean | null;
  /** Additional ledger points (partial credit). Negative = penalty. */
  ledgerPoints?: number;
  ledgerReason?: string;
  feedback: Feedback;
  /** Plain text preview of the attempt for the (wrong-answer) submission log. */
  submission?: string;
  /** Mark the node failed (e.g. attempts exhausted). */
  fail?: boolean;
  /** Override the points recorded on the node.solved event (partial-credit primitives). */
  solvePoints?: number;
}

export type ValidationResult = { ok: true } | { ok: false; code: "invalid" | "conflict" | "locked" | "attempts_exhausted"; message: string };

export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

export interface PrimitiveRuntime {
  now: Date;
  playtest: boolean;
  facts: Facts;
  /** Runs a read-only query against this node's sandbox database. */
  sql?: (sql: string) => Promise<SqlResult>;
  /** The team's evidence board links (for board-deduction). */
  boardLinks?: () => Promise<{ from: string; to: string; label: string }[]>;
}

export interface ArtifactSpec {
  name: string;
  mime: string;
  description: string;
  build: () => Promise<Uint8Array> | Uint8Array;
}

/* ─────────────────────────── Synthetic web mechanics ─────────────────────────── */

export interface SiteRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  cookies: Record<string, string>;
  body: string;
}

export interface SiteResponse {
  status: number;
  contentType?: string;
  headers?: Record<string, string>;
  body: string | Uint8Array;
  setCookies?: string[];
  /** Recorded as a `discovery` journal event for the contributing node (first time only). */
  discovery?: { key: string; label: string };
}

export interface SiteContribution {
  site: string;
  pages?: { path: string; title: string; nav?: boolean; html: string }[];
  comments?: { path: string; text: string }[];
  hiddenElements?: { path: string; html: string }[];
  endpoints?: { method: "GET" | "POST"; path: string; handle: (req: SiteRequest) => SiteResponse }[];
  cookies?: { name: string; value: string; httpOnly?: boolean }[];
  storage?: { kind: "local" | "session"; key: string; value: string }[];
  indexedDb?: { db: string; store: string; records: { key: string; value: unknown }[] }[];
  cache?: { cache: string; url: string; body: string; contentType: string }[];
  console?: { level: "log" | "info" | "debug" | "warn"; message: string }[];
  domInserted?: { path: string; html: string }[];
  /** Comments/notes placed in the original source, visible only via the source map. */
  sourceNotes?: string[];
  /** Non-secret constants compiled into the client bundle. */
  sourceConfig?: Record<string, unknown>;
  /** Extra headers on the bootstrap/status API. */
  statusHeaders?: Record<string, string>;
  /** Extra fields merged into /api/status JSON. */
  statusFields?: Record<string, unknown>;
}

/* ─────────────────────────── The contract ─────────────────────────── */

export interface Described {
  skills: string[];
  tools: string[];
  interaction: InteractionProfile;
}

export interface ChallengePrimitive<C = any, P = any, S = any, A extends { type: string } = any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- heterogeneous registry
  id: string;
  version: string;
  family: string;
  label: string;
  summary: string;
  schema: ZodType<C>;
  actionSchema: ZodType<A>;
  /** A sensible default config (used by Studio "add node" and the planner). */
  example(): Record<string, unknown>;
  createInstance(config: C, ctx: InstanceContext): Promise<Instance<P, S>> | Instance<P, S>;
  /** The public representation sent to the team's browser. Must never include `secret`. */
  view(instance: Instance<P, S>, node: NodeState | undefined, state: GameState): unknown;
  validateAction(action: A, instance: Instance<P, S>, node: NodeState | undefined, state: GameState): ValidationResult;
  applyAction(action: A, instance: Instance<P, S>, node: NodeState | undefined, state: GameState, rt: PrimitiveRuntime): Promise<Transition> | Transition;
  /** Actions that solve the instance. Used by the challenge harness and the publish validator. */
  intendedSolution(instance: Instance<P, S>, state: GameState): A[];
  /** Is this action an answer attempt (rate limited, logged as a submission)? */
  isAttempt(action: A): boolean;
  artifacts?(instance: Instance<P, S>, ctx: InstanceContext): ArtifactSpec[];
  site?(instance: Instance<P, S>, ctx: InstanceContext): SiteContribution | null;
  difficulty(config: C): DifficultyProfile;
  describe(config: C): Described;
  /** Structural "make it harder" transform. Returns null when the config is already at its ceiling. */
  harden?(config: C): { config: C; changes: string[] } | null;
  /** Needs the per-node SQL sandbox. */
  sqlDataset?(instance: Instance<P, S>): { schema: string; data: string };
}

/* ─────────────────────────── Shared helpers ─────────────────────────── */

export type Normalize = "exact" | "standard" | "loose";

export function normalize(raw: string, mode: Normalize): string {
  let s = String(raw ?? "").normalize("NFKC").trim();
  if (mode === "exact") return s;
  s = s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
  if (mode === "loose") s = s.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
  return s;
}

const MATCH_KEY = "dossier-match";

/** Constant-time comparison of two normalised strings. */
export function answerMatches(submitted: string, expected: string | string[], mode: Normalize = "loose"): boolean {
  const s = normalize(submitted, mode);
  if (!s) return false;
  const a = createHmac("sha256", MATCH_KEY).update(s).digest();
  let ok = false;
  for (const e of Array.isArray(expected) ? expected : [expected]) {
    const b = createHmac("sha256", MATCH_KEY).update(normalize(e, mode)).digest();
    ok = timingSafeEqual(a, b) || ok;
  }
  return ok;
}

export function attempts(node: NodeState | undefined): number {
  return Number(node?.steps["attempts"] ?? 0);
}

export function answerTransition(ok: boolean, submitted: string, node: NodeState | undefined, opts: { success?: string; fail?: string; maxAttempts?: number } = {}): Transition {
  const n = attempts(node) + 1;
  const events: StateEventBody[] = [];
  if (!ok) events.push({ type: "node.step", node: "", key: "attempts", value: n });
  const exhausted = !ok && opts.maxAttempts !== undefined && n >= opts.maxAttempts;
  return {
    events,
    solved: ok,
    correct: ok,
    submission: submitted.slice(0, 120),
    fail: exhausted,
    feedback: ok
      ? { tone: "success", title: "ACCESS GRANTED", message: opts.success }
      : { tone: "fail", title: "ACCESS DENIED", message: exhausted ? "No attempts remain for this file." : (opts.fail ?? "That does not check out.") },
  };
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
