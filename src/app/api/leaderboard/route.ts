import { json, route } from "@/server/http";
import { getLeaderboard, publicLeaderboardView } from "@/server/engine/leaderboard";
import { GameError } from "@/server/engine/errors";
import { cookieName, hasRole, resolveStaffSession } from "@/server/auth/session";

/** Public scoreboard (frozen during a freeze). Staff may request `scope=live`. */
export const GET = route({ auth: "none", event: true }, async ({ req, db, event, cookies }) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "live" ? "live" : "public";
  if (scope === "live") {
    const s = await resolveStaffSession(db, cookies[cookieName("staff")]);
    if (!s || s.kind !== "staff" || !hasRole(s.staff.role, "admin")) throw new GameError("forbidden", "Live scores are staff-only during a freeze.");
  }
  const lb = await getLeaderboard(db, event!.id, scope);
  const since = Number(url.searchParams.get("v") ?? -1);
  if (since === lb.version) return json({ unchanged: true, version: lb.version });
  return json(scope === "live" ? lb : publicLeaderboardView(lb), { headers: { "cache-control": "no-store" } });
});
