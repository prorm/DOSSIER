import { and, asc, eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { challenges, eventLog, hintPurchases } from "../db/schema";
import type { ChallengeRow, EngineContext, EventRow, TeamProgress } from "./types";

export async function loadChallenges(db: Executor, eventId: string, includeHidden = false): Promise<ChallengeRow[]> {
  const rows = await db.select().from(challenges).where(eq(challenges.eventId, eventId)).orderBy(asc(challenges.sortOrder), asc(challenges.id));
  return includeHidden ? rows : rows.filter((r) => !r.hidden);
}

export async function loadContext(db: Executor, event: EventRow, now = new Date()): Promise<EngineContext> {
  const list = await loadChallenges(db, event.id);
  return { event, now, challenges: list, byId: new Map(list.map((c) => [c.id, c])) };
}

export async function loadProgress(db: Executor, eventId: string, teamId: string): Promise<TeamProgress> {
  const [solves, hints] = await Promise.all([
    db
      .select({ challengeId: eventLog.challengeId, createdAt: eventLog.createdAt })
      .from(eventLog)
      .where(and(eq(eventLog.eventId, eventId), eq(eventLog.teamId, teamId), eq(eventLog.type, "solve"))),
    db
      .select({ challengeId: hintPurchases.challengeId, hintIndex: hintPurchases.hintIndex })
      .from(hintPurchases)
      .where(and(eq(hintPurchases.eventId, eventId), eq(hintPurchases.teamId, teamId))),
  ]);
  return {
    teamId,
    solvedAt: new Map(solves.filter((s) => s.challengeId).map((s) => [s.challengeId!, s.createdAt])),
    hints: new Set(hints.map((h) => `${h.challengeId}:${h.hintIndex}`)),
  };
}
