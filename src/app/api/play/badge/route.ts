import { route } from "@/server/http";
import { badgeToken } from "@/server/engine/live";

/** A fresh single-use team badge (90 s). Volunteers scan it to award a checkpoint. */
export const GET = route({ auth: "team", event: true }, async ({ event, team }) => {
  return badgeToken(event!.id, team.team.id);
});
