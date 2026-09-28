import { count, desc, eq, max } from "drizzle-orm";
import { route } from "@/server/http";
import { announcements, checkpointScans, submissions } from "@/server/db/schema";
import { eventPhase, freezeInstant } from "@/server/engine/event";
import { leaderboardVersion } from "@/server/engine/leaderboard";

/** Staff polling fallback: tiny version stamps for dashboards and stations. */
export const GET = route({ auth: "staffOrStation", event: true }, async ({ db, event }) => {
  const e = event!;
  const [[subs], [scans], [ann], v] = await Promise.all([
    db.select({ n: count(), last: max(submissions.id) }).from(submissions).where(eq(submissions.eventId, e.id)),
    db.select({ n: count(), last: max(checkpointScans.decidedAt) }).from(checkpointScans).where(eq(checkpointScans.eventId, e.id)),
    db.select().from(announcements).where(eq(announcements.eventId, e.id)).orderBy(desc(announcements.createdAt)).limit(1),
    leaderboardVersion(db, e.id),
  ]);
  return {
    eventStatus: eventPhase(e),
    frozen: Boolean(freezeInstant(e)),
    lbVersion: v,
    teamStamp: [subs?.n, subs?.last, scans?.n, scans?.last?.toISOString()].join(":"),
    lastAnnouncement: ann ? { id: ann.id, title: ann.title, body: ann.body, level: ann.level, at: ann.createdAt.toISOString() } : null,
  };
});
