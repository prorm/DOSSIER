/**
 * Studio's production line: STORY → WORLD → CHALLENGES → LOGIC → PRESENTATION → PLAYTEST → PUBLISH.
 *
 * Two kinds of truth live here:
 *
 *  - the *stations* (derivePipeline) – what state the draft is really in right
 *    now, with the real numbers it holds (characters found, nodes compiled,
 *    depth of the graph, validation verdict, published version);
 *  - the *build trace* – the recorded log of a Generate / Validate / Publish
 *    run: every stage with its measured duration, its counts and its verdict.
 *    A trace is a receipt, not an animation: stages that fail show red and the
 *    line stops there.
 *
 * The visual layer only ever reads these. It has no progress numbers of its own.
 */

export type StationStatus = "empty" | "pending" | "ready" | "warn" | "fail" | "done";

export const STATION_IDS = ["story", "world", "challenges", "logic", "presentation", "playtest", "publish"] as const;
export type StationId = (typeof STATION_IDS)[number];

export interface Metric {
  label: string;
  value: string | number;
}

export interface Station {
  id: StationId;
  index: number;
  title: string;
  verb: string;
  status: StationStatus;
  /** One line a person can read at a glance ("14 characters · 9 locations"). */
  headline: string;
  metrics: Metric[];
  /** What to do next, when this station is the blocker. */
  next?: string;
}

export interface BuildStage {
  id: string;
  label: string;
  /** skip: the line stopped earlier, so this stage never ran (shown dark, never green). */
  status: "ok" | "warn" | "fail" | "skip";
  ms: number;
  metrics: Metric[];
  note?: string;
}

export interface BuildTrace {
  kind: "generate" | "validate" | "publish";
  at: string;
  totalMs: number;
  stages: BuildStage[];
  ok: boolean;
}

/** Everything derivePipeline needs, gathered by the server from the draft (no client guessing). */
export interface PipelineInput {
  hasStory: boolean;
  story: { characters: number; suspects: number; locations: number; timeline: number; organisations: number; artifacts: number; sources: number } | null;
  blueprint: {
    nodes: number;
    rounds: number;
    acts: number;
    mechanics: number;
    families: number;
    evidence: number;
    facts: number;
    sites: number;
    checkpoints: number;
    redHerrings: number;
  } | null;
  graph: { edges: number; maxDepth: number; criticalMinutes: number; totalMinutes: number; perTeam: number; textOnlyRisk: number } | null;
  presentation: { theme: string; intensity: string; hasWording: boolean };
  validation: { ok: boolean; errors: number; warnings: number; solved: number; nodes: number; stale: boolean; at: string } | null;
  published: { version: number; active: boolean; at: string | null };
  /** Draft changed after the last validation / publish. */
  dirtySincePublish: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function derivePipeline(p: PipelineInput): Station[] {
  const s = p.story;
  const b = p.blueprint;
  const g = p.graph;
  const v = p.validation;

  const story: Station = {
    id: "story",
    index: 0,
    title: "Story",
    verb: "Tell it",
    status: p.hasStory ? "ready" : "empty",
    headline: s ? `${plural(s.characters, "person", "people")} · ${plural(s.locations, "place")} · ${plural(s.timeline, "beat")}` : "Drop in your story",
    metrics: s
      ? [
          { label: "characters", value: s.characters },
          { label: "suspects", value: s.suspects },
          { label: "locations", value: s.locations },
          { label: "timeline", value: s.timeline },
        ]
      : [],
    next: p.hasStory ? undefined : "Import a Markdown story",
  };

  const world: Station = {
    id: "world",
    index: 1,
    title: "World",
    verb: "Build it",
    status: b ? "ready" : p.hasStory ? "pending" : "empty",
    headline: b ? `${plural(b.facts, "fact")} per team · ${plural(b.sites, "site")} · ${plural(b.checkpoints, "checkpoint")}` : "Waiting for the story",
    metrics: b
      ? [
          { label: "world facts", value: b.facts },
          { label: "sites", value: b.sites },
          { label: "checkpoints", value: b.checkpoints },
          { label: "exhibits", value: b.evidence },
        ]
      : [],
    next: !b && p.hasStory ? "Choose rounds and generate" : undefined,
  };

  const challenges: Station = {
    id: "challenges",
    index: 2,
    title: "Challenges",
    verb: "Shape it",
    status: b ? "ready" : "empty",
    headline: b ? `${plural(b.nodes, "file")} · ${plural(b.rounds, "round")} · ${plural(b.mechanics, "mechanic")}` : "No challenges yet",
    metrics: b
      ? [
          { label: "files", value: b.nodes },
          { label: "rounds", value: b.rounds },
          { label: "mechanics", value: b.mechanics },
          { label: "red herrings", value: b.redHerrings },
        ]
      : [],
  };

  const logic: Station = {
    id: "logic",
    index: 3,
    title: "Logic",
    verb: "Wire it",
    status: g ? (g.textOnlyRisk > 0.5 ? "warn" : "ready") : "empty",
    headline: g ? `${g.edges} gates · depth ${g.maxDepth} · critical path ${g.criticalMinutes} min` : "No graph yet",
    metrics: g
      ? [
          { label: "gates", value: g.edges },
          { label: "max depth", value: g.maxDepth },
          { label: "critical path", value: `${g.criticalMinutes} min` },
          { label: "unique per team", value: g.perTeam },
        ]
      : [],
    next: g && g.textOnlyRisk > 0.5 ? "Many files can be cracked from text alone — add tool-based mechanics" : undefined,
  };

  const presentation: Station = {
    id: "presentation",
    index: 4,
    title: "Presentation",
    verb: "Stage it",
    status: b ? "ready" : "empty",
    headline: b ? `${p.presentation.theme.replace("-", " ")} · ${p.presentation.intensity} opening` : "Pick a look after generating",
    // What is saved on the draft (the tiles below may be previewing another look until "Save look").
    metrics: b ? [{ label: "saved theme", value: p.presentation.theme.replace("-", " ") }, { label: "saved intensity", value: p.presentation.intensity }] : [],
  };

  const playtest: Station = {
    id: "playtest",
    index: 5,
    title: "Playtest",
    verb: "Prove it",
    status: !b ? "empty" : !v || v.stale ? "pending" : !v.ok ? "fail" : v.warnings ? "warn" : "ready",
    headline: !v ? "Not validated" : v.stale ? "Changed since last validation" : v.ok ? `${v.solved}/${v.nodes} solved by the bot · ${plural(v.warnings, "warning")}` : `${plural(v.errors, "error")} block publishing`,
    metrics: v ? [{ label: "solved", value: `${v.solved}/${v.nodes}` }, { label: "errors", value: v.errors }, { label: "warnings", value: v.warnings }] : [],
    next: b && (!v || v.stale) ? "Run validation" : v && !v.ok ? "Fix the errors, then validate again" : undefined,
  };

  const publish: Station = {
    id: "publish",
    index: 6,
    title: "Publish",
    verb: "Ship it",
    status: p.published.version ? (p.dirtySincePublish ? "pending" : "done") : b && v?.ok && !v.stale ? "ready" : "empty",
    headline: p.published.version ? `v${p.published.version}${p.published.active ? " · live event" : ""}${p.dirtySincePublish ? " · unpublished edits" : ""}` : "Unpublished",
    metrics: p.published.version ? [{ label: "version", value: `v${p.published.version}` }, { label: "active", value: p.published.active ? "yes" : "no" }] : [],
  };

  return [story, world, challenges, logic, presentation, playtest, publish];
}

/** The first station that is not done: what the organiser should look at next. */
export function currentStation(stations: Station[]): Station {
  return stations.find((s) => s.status === "empty" || s.status === "pending" || s.status === "fail") ?? stations[stations.length - 1]!;
}

export const STATUS_TONE: Record<StationStatus, "mute" | "info" | "ok" | "warn" | "bad"> = {
  empty: "mute",
  pending: "info",
  ready: "ok",
  warn: "warn",
  fail: "bad",
  done: "ok",
};
