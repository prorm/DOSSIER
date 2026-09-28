import { and, count, desc, eq, max } from "drizzle-orm";
import { route } from "@/server/http";
import { announcements, boardStates, checkpointScans, eventLog, evidenceReveals } from "@/server/db/schema";
import { eventPhase, freezeInstant } from "@/server/engine/event";
import { getLeaderboard } from "@/server/engine/leaderboard";

/**
 * Polling fallback + HUD refresh. Tiny payload: versions and the team's own
 * standing. `teamStamp` changes whenever anything team-specific changes.
 */
export const GET = route({ auth: "team", event: true }, async ({ db, event, team }) => {
  const e = event!;
  const teamId = team.team.id;
  const [lb, [log], [scans], [reveals], [board], [ann]] = await Promise.all([
    getLeaderboard(db, e.id, "public"),
    db.select({ n: count(), last: max(eventLog.id) }).from(eventLog).where(and(eq(eventLog.eventId, e.id), eq(eventLog.teamId, teamId))),
    db.select({ n: count(), last: max(checkpointScans.decidedAt) }).from(checkpointScans).where(eq(checkpointScans.teamId, teamId)),
    db.select({ n: count() }).from(evidenceReveals).where(eq(evidenceReveals.teamId, teamId)),
    db.select({ v: boardStates.version }).from(boardStates).where(eq(boardStates.teamId, teamId)),
    db.select().from(announcements).where(eq(announcements.eventId, e.id)).orderBy(desc(announcements.createdAt)).limit(1),
  ]);
  const me = lb.standings.find((s) => s.teamId === teamId);
  return {
    eventStatus: eventPhase(e),
    frozen: Boolean(freezeInstant(e)),
    lbVersion: lb.version,
    teamStamp: [log?.n, log?.last, scans?.n, scans?.last?.toISOString(), reveals?.n, board?.v ?? 0, team.team.status].join(":"),
    score: me?.score ?? 0,
    rank: me?.rank ?? null,
    teams: lb.standings.filter((s) => !s.disqualified).length,
    lastAnnouncement: ann ? { id: ann.id, title: ann.title, body: ann.body, level: ann.level, at: ann.createdAt.toISOString() } : null,
  };
});
