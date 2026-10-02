import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ─────────────────────────── Event & content ─────────────────────────── */

export type EventStatus = "draft" | "live" | "paused" | "ended";

/* ─────────────────────────── Organizations ─────────────────────────── */

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  university: text("university").notNull().default(""),
  logo: text("logo"),
  createdAt: createdAt(),
});

export const events = pgTable("events", {
  id: text("id").primaryKey(), // pack slug / studio id
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  /** "pack" (imported from ./packs) or "studio" (authored in DOSSIER Studio). */
  kind: text("kind").$type<"pack" | "studio">().notNull().default("pack"),
  name: text("name").notNull(),
  status: text("status").$type<EventStatus>().notNull().default("draft"),
  active: boolean("active").notNull().default(false),
  /** Public event configuration (theme, rules, scoring defaults). Safe to project. */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  /** Server-only inquest story (contains solution). Never sent raw to clients. */
  story: jsonb("story").$type<Record<string, unknown> | null>(),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  startedAt: ts("started_at"),
  endedAt: ts("ended_at"),
  pausedAt: ts("paused_at"),
  frozenAt: ts("frozen_at"),
  packHash: text("pack_hash"),
  /** Published, compiled blueprint (server-only: contains truth tables and templates). */
  blueprint: jsonb("blueprint").$type<Record<string, unknown> | null>(),
  blueprintVersion: integer("blueprint_version").notNull().default(0),
  /** Studio working copy; publishing validates it and copies it to `blueprint`. */
  draft: jsonb("draft").$type<Record<string, unknown> | null>(),
  publishedAt: ts("published_at"),
  displayKeyVersion: integer("display_key_version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const challenges = pgTable(
  "challenges",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    /** Challenge family (cryptic, browser, forensics, ctf, inquest, physical, final, hunt, …). */
    mode: text("mode").notNull(),
    primitive: text("primitive").notNull().default("static-answer"),
    roundId: text("round_id"),
    actId: text("act_id"),
    difficulty: jsonb("difficulty").$type<Record<string, number>>().notNull().default({}),
    estimatedMinutes: integer("estimated_minutes").notNull().default(15),
    category: text("category"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    /** Mode-specific configuration (points, deps, hints, gates). Contains hint text: project before sending. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    answerType: text("answer_type").$type<"text" | "flag" | "number">().notNull().default("text"),
    normalize: text("normalize").$type<"loose" | "standard" | "exact">().notNull().default("standard"),
    /** HMAC-SHA256(ANSWER_SECRET, salt ‖ normalized). Never leaves the server. */
    answerHashes: jsonb("answer_hashes").$type<{ salt: string; hash: string }[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    hidden: boolean("hidden").notNull().default(false),
    sourceFile: text("source_file"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] }), index("challenges_mode_idx").on(t.eventId, t.mode, t.sortOrder)],
);

export const checkpoints = pgTable(
  "checkpoints",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    location: text("location").notNull().default(""),
    instructionsMd: text("instructions_md").notNull().default(""),
    points: integer("points").notNull().default(0),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    pinHash: text("pin_hash"),
    tokenVersion: integer("token_version").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").$type<"qr" | "gps">().notNull().default("qr"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    radiusM: doublePrecision("radius_m"),
    /** First N teams only (0 = unlimited). */
    claimLimit: integer("claim_limit").notNull().default(0),
    expiresAt: ts("expires_at"),
    /** Printed codes are issued per team; a team may only claim its own code. */
    teamScoped: boolean("team_scoped").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

/* ─────────────────────────── Identity ─────────────────────────── */

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").$type<"active" | "disqualified">().notNull().default("active"),
    statusReason: text("status_reason"),
    affiliation: text("affiliation"),
    /** "playtest" teams belong to organisers: they can play drafts and never appear on public boards. */
    kind: text("kind").$type<"player" | "playtest">().notNull().default("player"),
    createdBy: text("created_by"),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("teams_event_name_key").on(t.eventId, t.nameKey)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [index("participants_team_idx").on(t.teamId)],
);

export type StaffRole = "owner" | "admin" | "volunteer";

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").$type<StaffRole>().notNull(),
  passwordHash: text("password_hash").notNull(),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the opaque session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    kind: text("kind").$type<"team" | "staff" | "station">().notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staffUsers.id, { onDelete: "cascade" }),
    eventId: text("event_id"),
    checkpointId: text("checkpoint_id"),
    csrfSecret: text("csrf_secret").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_team_idx").on(t.teamId), index("sessions_last_seen_idx").on(t.lastSeenAt)],
);

/* ─────────────────────────── Gameplay records ─────────────────────────── */

export const unlocks = pgTable(
  "unlocks",
  {
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").notNull(),
    reason: text("reason").notNull().default("dependency"),
    unlockedAt: ts("unlocked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.challengeId] })],
);

export const submissions = pgTable(
  "submissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").notNull(),
    correct: boolean("correct").notNull(),
    /** Keyed hash of the normalized submission: lets admins spot shared wrong answers without storing plaintext. */
    submittedHash: text("submitted_hash").notNull(),
    /** Plaintext preview of WRONG submissions only (truncated). Correct answers are never stored in clear. */
    preview: text("preview"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("submissions_team_challenge_idx").on(t.teamId, t.challengeId, t.createdAt),
    index("submissions_event_recent_idx").on(t.eventId, t.createdAt),
    index("submissions_challenge_hash_idx").on(t.eventId, t.challengeId, t.submittedHash),
  ],
);

export const hintPurchases = pgTable(
  "hint_purchases",
  {
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").notNull(),
    hintIndex: integer("hint_index").notNull(),
    cost: integer("cost").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.challengeId, t.hintIndex] })],
);

export const checkpointScans = pgTable(
  "checkpoint_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    checkpointId: text("checkpoint_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    status: text("status").$type<"pending" | "confirmed" | "rejected">().notNull().default("pending"),
    method: text("method").$type<"team-scan" | "badge-scan" | "manual" | "gps">().notNull(),
    clientRef: text("client_ref"),
    points: integer("points").notNull().default(0),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("checkpoint_scans_team_unique").on(t.eventId, t.checkpointId, t.teamId),
    index("checkpoint_scans_status_idx").on(t.eventId, t.checkpointId, t.status),
  ],
);

export const evidenceReveals = pgTable(
  "evidence_reveals",
  {
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id").notNull(),
    source: text("source").notNull(),
    revealedAt: ts("revealed_at").notNull().defaultNow(),
    seenAt: ts("seen_at"),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.evidenceId] })],
);

export const accusations = pgTable(
  "accusations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    answers: jsonb("answers").$type<Record<string, string>>().notNull(),
    credit: integer("credit").notNull(),
    penalty: integer("penalty").notNull(),
    correctFields: jsonb("correct_fields").$type<string[]>().notNull(),
    fullyCorrect: boolean("fully_correct").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("accusations_team_attempt").on(t.teamId, t.attemptNo)],
);

export const boardStates = pgTable("board_states", {
  teamId: uuid("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  layout: jsonb("layout").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    level: text("level").$type<"info" | "warning" | "critical">().notNull().default("info"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("announcements_event_idx").on(t.eventId, t.createdAt)],
);

export const scoreAdjustments = pgTable("score_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

/* ─────────────────────────── Append-only ledgers ─────────────────────────── */

export type LogType = "solve" | "hint" | "checkpoint" | "accusation" | "adjustment" | "partial";

/**
 * The event log is the score ledger. Rows are append-only (enforced by a DB
 * trigger). Every score shown anywhere is derived from these rows.
 */
export const eventLog = pgTable(
  "event_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id").notNull(),
    type: text("type").$type<LogType>().notNull(),
    challengeId: text("challenge_id"),
    /** Fixed point delta. Solves store null: their value is derived (dynamic scoring). */
    points: integer("points"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("event_log_event_idx").on(t.eventId, t.createdAt),
    index("event_log_team_idx").on(t.eventId, t.teamId),
    index("event_log_challenge_idx").on(t.eventId, t.challengeId, t.type),
    // A team can solve a challenge once; concurrent duplicate solves collapse here.
    uniqueIndex("event_log_solve_unique").on(t.teamId, t.challengeId).where(sql`type = 'solve'`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id"),
    actorType: text("actor_type").$type<"staff" | "station" | "system" | "team">().notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    target: text("target"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_event_idx").on(t.eventId, t.createdAt)],
);

export const leaderboardCache = pgTable(
  "leaderboard_cache",
  {
    eventId: text("event_id").notNull(),
    scope: text("scope").$type<"live" | "public">().notNull(),
    version: integer("version").notNull().default(0),
    payload: jsonb("payload").$type<unknown>().notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.scope] })],
);

/* ─────────────────────────── Security bookkeeping ─────────────────────────── */

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull().defaultNow(),
  strikes: integer("strikes").notNull().default(0),
  blockedUntil: ts("blocked_until"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const usedTokens = pgTable("used_tokens", {
  nonce: text("nonce").primaryKey(),
  kind: text("kind").notNull(),
  usedAt: ts("used_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

/* ─────────────────────────── Compiled event (materialised from the blueprint) ─────────────────────────── */

const eventFk = () =>
  text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

export const stories = pgTable("stories", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  /** Original Markdown sources as imported ([{ name, markdown }]). */
  sources: jsonb("sources").$type<{ name: string; markdown: string }[]>().notNull().default([]),
  /** Validated structured story model extracted by the compiler. */
  model: jsonb("model").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const narrativeActs = pgTable(
  "narrative_acts",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    phase: text("phase"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

export const rounds = pgTable(
  "rounds",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    actId: text("act_id").notNull(),
    title: text("title").notNull(),
    family: text("family").notNull(),
    tier: text("tier").notNull(),
    intro: text("intro").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

export const characters = pgTable(
  "characters",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    bio: text("bio").notNull().default(""),
    isSuspect: boolean("is_suspect").notNull().default(false),
    relationships: jsonb("relationships").$type<{ to: string; kind: string }[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

/** Inquest truth per suspect (server-only). */
export const suspects = pgTable(
  "suspects",
  {
    eventId: eventFk(),
    characterId: text("character_id").notNull(),
    isCulprit: boolean("is_culprit").notNull().default(false),
    motive: text("motive").notNull().default(""),
    redHerring: text("red_herring"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.characterId] })],
);

export const locations = pgTable(
  "locations",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

export const artifacts = pgTable(
  "artifacts",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("object"),
    description: text("description").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    at: text("at").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    actors: jsonb("actors").$type<string[]>().notNull().default([]),
    locationId: text("location_id"),
    isPublic: boolean("is_public").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

/** Evidence catalogue (definitions). Team possession lives in the state journal / evidence_reveals. */
export const evidence = pgTable(
  "evidence",
  {
    eventId: eventFk(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull().default(""),
    about: jsonb("about").$type<Record<string, string[]>>().notNull().default({}),
    autoGate: jsonb("auto_gate").$type<unknown>(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.id] })],
);

export const hints = pgTable(
  "hints",
  {
    eventId: eventFk(),
    challengeId: text("challenge_id").notNull(),
    idx: integer("idx").notNull(),
    level: text("level").notNull(),
    cost: integer("cost").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.challengeId, t.idx] })],
);

/** Registry snapshot of available primitives (introspection / external tooling). */
export const challengeTypes = pgTable("challenge_types", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  family: text("family").notNull(),
  label: text("label").notNull(),
  summary: text("summary").notNull().default(""),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Materialised edges of the challenge graph (gates + fact flow), for querying and analytics. */
export const challengeDependencies = pgTable(
  "challenge_dependencies",
  {
    eventId: eventFk(),
    challengeId: text("challenge_id").notNull(),
    dependsOn: text("depends_on").notNull(),
    /** node | evidence | checkpoint | fact | flag | phase | discovery */
    kind: text("kind").notNull(),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.challengeId, t.dependsOn, t.kind] }), index("challenge_deps_target_idx").on(t.eventId, t.dependsOn)],
);

/** One row per (team, node) the first time an instance is issued. No answers, only fingerprints. */
export const challengeInstances = pgTable(
  "challenge_instances",
  {
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").notNull(),
    primitive: text("primitive").notNull(),
    blueprintVersion: integer("blueprint_version").notNull(),
    seedFingerprint: text("seed_fingerprint").notNull(),
    answerFingerprint: text("answer_fingerprint"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.challengeId] })],
);

/* ─────────────────────────── Game state (event-sourced) ─────────────────────────── */

/** Append-only state journal. GameState is a pure fold over these rows. */
export const gameStateEvents = pgTable(
  "game_state_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id").notNull(),
    type: text("type").notNull(),
    nodeId: text("node_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Who caused it: "team", "system", "staff:<email>", "station:<id>". */
    actor: text("actor").notNull().default("team"),
    createdAt: createdAt(),
  },
  (t) => [index("gse_team_idx").on(t.eventId, t.teamId, t.id), index("gse_event_recent_idx").on(t.eventId, t.id), index("gse_node_idx").on(t.eventId, t.nodeId, t.type)],
);

/** Snapshot cache of the fold (rebuildable from the journal at any time). */
export const gameStates = pgTable("game_states", {
  teamId: uuid("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(0),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Evidence-board links (projection of the board with server-side validity, for gates and analytics). */
export const evidenceLinks = pgTable(
  "evidence_links",
  {
    eventId: text("event_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    linkId: text("link_id").notNull(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    relation: text("relation").notNull().default(""),
    valid: boolean("valid").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.linkId] })],
);

export const nowSql = sql`now()`;
