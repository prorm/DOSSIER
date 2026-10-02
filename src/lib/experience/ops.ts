/**
 * The Control Room's view of the case.
 *
 * The same universe players explore, seen from above: every file is lit by how
 * many teams have reached it, turns amber where teams are stuck, and settles
 * once everyone has been through it. Teams are pins orbiting the file they are
 * working on. Every value is read from the telemetry the server derived from
 * the team journals; nothing here is sampled, smoothed or invented.
 */

import type { UActIn, UEdgeIn, UNodeIn, UniverseInput } from "./universe";

export interface OpsNodeIn {
  id: string;
  title: string;
  family: string;
  actIndex: number;
  roundIndex: number;
  indexInRound: number;
  roundSize: number;
  points: number;
  minutes: number;
  optional: boolean;
  critical: boolean;
}

export interface OpsTelemetryIn {
  id: string;
  unlocked: number;
  solved: number;
  stuck: number;
  wrong: number;
  attempts: number;
}

export interface OpsGraphIn {
  nodes: OpsNodeIn[];
  edges: { from: string; to: string; kind: "gate" | "checkpoint" }[];
  acts: { id: string; title: string }[];
}

export function opsUniverse(graph: OpsGraphIn, telemetry: OpsTelemetryIn[], totalTeams: number): UniverseInput {
  const t = new Map(telemetry.map((n) => [n.id, n]));
  const nodes: UNodeIn[] = graph.nodes.map((n) => {
    const m = t.get(n.id);
    const reached = m?.unlocked ?? 0;
    const solved = m?.solved ?? 0;
    const stuck = m?.stuck ?? 0;
    // Nobody has been here yet: present but dim. Everyone has finished it: settled. Otherwise: lit.
    const state: UNodeIn["state"] = reached === 0 ? "locked" : totalTeams > 0 && solved >= totalTeams ? "solved" : "open";
    return {
      id: n.id,
      title: n.title,
      state,
      family: n.family,
      actIndex: n.actIndex,
      roundIndex: n.roundIndex,
      indexInRound: n.indexInRound,
      roundSize: n.roundSize,
      points: n.points,
      minutes: n.minutes,
      optional: n.optional,
      isNew: false,
      opensAt: null,
      // `locked` with progress reads as "in sight": an operator never wants a hidden file.
      progress: reached === 0 ? 0.5 : 1,
      // Stuck teams read as an anomaly on the file, exactly the way a struggling player's file does.
      signals: { discoveries: 0, contradictions: 0, wrong: stuck > 0 ? 3 : 0, hints: 0 },
      meta: { reached, solved, stuck, total: totalTeams, critical: n.critical },
    };
  });
  const known = new Set(nodes.map((n) => n.id));
  const edges: UEdgeIn[] = graph.edges.filter((e) => known.has(e.from) && known.has(e.to)).map((e) => ({ from: e.from, to: e.to, kind: e.kind }));
  const acts: UActIn[] = graph.acts.map((a) => ({ id: a.id, title: a.title, started: true, complete: false }));
  return { nodes, edges, acts };
}

/* ─────────────────────────── attention ─────────────────────────── */

export interface AttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  kind: "file" | "team" | "desk";
  title: string;
  detail: string;
  /** The file to fly to, when the item is about one. */
  node?: string;
}

interface AttentionIn {
  warnings: { severity: "critical" | "warning" | "info"; node?: string; message: string }[];
  /** File titles by id, so an item can be headed by the file it is about. */
  titles?: Record<string, string>;
  teams: { teamId: string; name: string; stuck: boolean; current: { id: string; title: string; minutes: number } | null }[];
  checkpoints: { id: string; name: string; pending: number }[];
}

const RANK = { critical: 0, warning: 1, info: 2 } as const;

/** What an operator should look at next: warnings, stuck teams, scans waiting on a volunteer. Most urgent first. */
export function attention(i: AttentionIn, limit = 6): AttentionItem[] {
  const out: AttentionItem[] = [];
  i.warnings.forEach((w, k) =>
    out.push({ id: `w${k}`, severity: w.severity, kind: "file", title: (w.node && i.titles?.[w.node]) || (w.severity === "info" ? "Notice" : w.severity === "critical" ? "Needs action" : "Watch"), detail: w.node && i.titles?.[w.node] ? w.message.split(`“${i.titles[w.node]}”`).join("this file") : w.message, node: w.node }),
  );
  // A couple of stuck teams are named one by one; a crowd is one line, not a wall of them.
  const stuck = i.teams.filter((t) => t.stuck);
  if (stuck.length > 2) {
    out.push({ id: "stuck-teams", severity: "warning", kind: "team", title: `${stuck.length} teams stuck`, detail: `${stuck.slice(0, 3).map((t) => t.name).join(", ")}${stuck.length > 3 ? ` and ${stuck.length - 3} more` : ""}`, node: stuck[0]!.current?.id });
  } else {
    for (const t of stuck) out.push({ id: `t${t.teamId}`, severity: "warning", kind: "team", title: t.name, detail: t.current ? `stuck ${t.current.minutes} min on “${t.current.title}”` : "no progress for over 30 minutes", node: t.current?.id });
  }
  for (const c of i.checkpoints) if (c.pending > 0) out.push({ id: `c${c.id}`, severity: c.pending >= 5 ? "warning" : "info", kind: "desk", title: c.name, detail: `${c.pending} scan${c.pending === 1 ? "" : "s"} waiting for a volunteer` });
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, limit);
}

/* ─────────────────────────── the clock ─────────────────────────── */

export function clockParts(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${String(h).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Elapsed and remaining for a running event; both null when the event has no schedule. */
export function eventClock(startedAt: string | null, endsAt: string | null, now: number): { elapsed: string | null; remaining: string | null; fraction: number | null } {
  const a = startedAt ? Date.parse(startedAt) : NaN;
  const b = endsAt ? Date.parse(endsAt) : NaN;
  return {
    elapsed: Number.isFinite(a) ? clockParts(now - a) : null,
    remaining: Number.isFinite(b) ? clockParts(b - now) : null,
    fraction: Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.min(1, Math.max(0, (now - a) / (b - a))) : null,
  };
}

/** Text for a live `activity` signal, using the names the page already has. */
export function activityText(m: { node?: string; correct?: boolean; solved?: boolean; hint?: boolean }, nodeTitle: (id: string) => string): string {
  const what = m.node ? `“${nodeTitle(m.node)}”` : "a file";
  if (m.hint) return `asked for a hint on ${what}`;
  if (m.solved) return `solved ${what}`;
  if (m.correct) return `made progress on ${what}`;
  // Only an answer that was judged wrong is a miss; a step (a question asked, a page opened) is just work.
  if (m.correct === false) return `missed on ${what}`;
  return `worked on ${what}`;
}
