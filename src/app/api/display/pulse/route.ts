import { desc, eq } from "drizzle-orm";
import { route } from "@/server/http";
import { announcements } from "@/server/db/schema";
import { cookieName, resolveStaffSession } from "@/server/auth/session";
import { verifyDisplayToken } from "@/server/engine/display";
import { eventPhase, freezeInstant } from "@/server/engine/event";
import { GameError } from "@/server/engine/errors";
import { leaderboardVersion } from "@/server/engine/leaderboard";

/** Projector polling fallback (display token or staff session). */
export const GET = route({ auth: "none", event: true }, async ({ req, db, event, cookies }) => {
  const e = event!;
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!verifyDisplayToken(e, k) && !(await resolveStaffSession(db, cookies[cookieName("staff")]))) throw new GameError("unauthorized", "Invalid display link.");
  const [[ann], v] = await Promise.all([
    db.select().from(announcements).where(eq(announcements.eventId, e.id)).orderBy(desc(announcements.createdAt)).limit(1),
    leaderboardVersion(db, e.id),
  ]);
  return {
    eventStatus: eventPhase(e),
    frozen: Boolean(freezeInstant(e)),
    lbVersion: v,
    lastAnnouncement: ann ? { id: ann.id, title: ann.title, body: ann.body, level: ann.level, at: ann.createdAt.toISOString() } : null,
  };
});
