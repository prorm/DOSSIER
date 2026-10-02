import { z } from "zod";
import { readJson, route } from "@/server/http";
import { dispatch } from "@/server/game/engine";

const Body = z.object({ nodeId: z.string().min(1).max(64), action: z.record(z.string(), z.unknown()) });

/** The single command endpoint: every primitive action goes through the engine's dispatch pipeline. */
export const POST = route({ auth: "team", event: true }, async ({ req, db, ip, event, team }) => {
  const body = await readJson(req, Body);
  return dispatch(db, { event: event!, teamId: team.team.id, nodeId: body.nodeId, action: body.action, ip });
});
