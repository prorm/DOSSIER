import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { eventLog, events, leaderboardCache, teams } from "../db/schema";
import { bus, topics } from "../realtime/bus";
import { challenges } from "../db/schema";
import { freezeInstant } from "./event";
import { computeScores, nodeScoring, type ScoreComputation, type Standing, type SeriesPoint } from "./scoring";
import type { EventRow } from "./types";

export interface LeaderboardPayload {
  eventId: string;
  version: number;
  computedAt: string;
  frozen: boolean;
  frozenAt: string | null;
  standings: Standing[];
  /** Score-over-time for the top teams only (keeps payloads small on poor networks). */
  series: { teamId: string; name: string; points: SeriesPoint[] }[];
  solveCounts: Record<string, number>;
  firstBlood: Record<string, string>;
}

const SERIES_TOP_N = 10;

export async function computeFor(db: Executor, event: EventRow, until: Date | null): Promise<ScoreComputation> {
  const [teamRows, log, chs] = await Promise.all([
    // Playtest teams (organisers) never appear on boards.
    db.select({ id: teams.id, name: teams.name, status: teams.status, affiliation: teams.affiliation }).from(teams).where(and(eq(teams.eventId, event.id), eq(teams.kind, "player"))),
    db
      .select({ id: eventLog.id, teamId: eventLog.teamId, type: eventLog.type, challengeId: eventLog.challengeId, points: eventLog.points, createdAt: eventLog.createdAt })
      .from(eventLog)
      .where(eq(eventLog.eventId, event.id)),
    db.select().from(challenges).where(eq(challenges.eventId, event.id)),
  ]);
  return computeScores(teamRows, log, new Map(chs.map((c) => [c.id, nodeScoring(c)])), until);
}

function toPayload(event: EventRow, comp: ScoreComputation, version: number, frozenAt: Date | null): LeaderboardPayload {
  const top = comp.standings.filter((s) => !s.disqualified && s.score !== 0).slice(0, SERIES_TOP_N);
  return {
    eventId: event.id,
    version,
    computedAt: new Date().toISOString(),
    frozen: Boolean(frozenAt),
    frozenAt: frozenAt?.toISOString() ?? null,
    standings: comp.standings,
    series: top.map((s) => ({ teamId: s.teamId, name: s.name, points: comp.series[s.teamId] ?? [] })),
    solveCounts: comp.solveCounts,
    firstBlood: comp.firstBlood,
  };
}

const inflight = new Map<string, Promise<void>>();
const dirty = new Set<string>();

/**
 * Recomputes both cached views: "live" (staff, truth) and "public" (frozen
 * when a freeze is active). Concurrent calls coalesce: at most one running
 * recompute plus one queued re-run per event.
 */
export async function recomputeLeaderboard(db: Executor, eventId: string): Promise<void> {
  if (inflight.has(eventId)) {
    dirty.add(eventId);
    return inflight.get(eventId);
  }
  const run = (async () => {
    do {
      dirty.delete(eventId);
      const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!event) return;
      const frozenAt = freezeInstant(event);
      const live = await computeFor(db, event, null);
      const pub = frozenAt ? await computeFor(db, event, frozenAt) : live;
      const [prev] = await db
        .select({ version: leaderboardCache.version })
        .from(leaderboardCache)
        .where(and(eq(leaderboardCache.eventId, eventId), eq(leaderboardCache.scope, "live")))
        .limit(1);
      const version = (prev?.version ?? 0) + 1;
      for (const [scope, comp, fz] of [
        ["live", live, null],
        ["public", pub, frozenAt],
      ] as const) {
        const payload = toPayload(event, comp, version, fz);
        await db
          .insert(leaderboardCache)
          .values({ eventId, scope, version, payload, computedAt: new Date() })
          .onConflictDoUpdate({
            target: [leaderboardCache.eventId, leaderboardCache.scope],
            set: { version, payload, computedAt: sql`now()` },
          });
      }
      await bus().publish(topics.event(eventId), "leaderboard", { version });
    } while (dirty.has(eventId));
  })().finally(() => inflight.delete(eventId));
  inflight.set(eventId, run);
  return run;
}

export async function getLeaderboard(db: Executor, eventId: string, scope: "live" | "public"): Promise<LeaderboardPayload> {
  const [row] = await db
    .select()
    .from(leaderboardCache)
    .where(and(eq(leaderboardCache.eventId, eventId), eq(leaderboardCache.scope, scope)))
    .limit(1);
  if (row) return row.payload as LeaderboardPayload;
  await recomputeLeaderboard(db, eventId);
  const [again] = await db
    .select()
    .from(leaderboardCache)
    .where(and(eq(leaderboardCache.eventId, eventId), eq(leaderboardCache.scope, scope)))
    .limit(1);
  return again!.payload as LeaderboardPayload;
}

export async function leaderboardVersion(db: Executor, eventId: string): Promise<number> {
  const [row] = await db
    .select({ version: leaderboardCache.version })
    .from(leaderboardCache)
    .where(and(eq(leaderboardCache.eventId, eventId), eq(leaderboardCache.scope, "public")))
    .limit(1);
  return row?.version ?? 0;
}

/** Public projection: per-challenge stats are internal (they would reveal locked challenge ids). */
export function publicLeaderboardView(lb: LeaderboardPayload): LeaderboardPayload {
  return { ...lb, solveCounts: {}, firstBlood: {} };
}
