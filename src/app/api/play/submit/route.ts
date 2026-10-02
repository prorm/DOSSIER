import { z } from "zod";
import { readJson, route } from "@/server/http";
import { dispatch } from "@/server/game/engine";

const Body = z.object({ challengeId: z.string().min(1).max(64), answer: z.string().max(500) });

/** Answer submission shorthand (== action { type: "answer" }). */
export const POST = route({ auth: "team", event: true }, async ({ req, db, ip, event, team }) => {
  const body = await readJson(req, Body);
  return dispatch(db, { event: event!, teamId: team.team.id, nodeId: body.challengeId, action: { type: "answer", value: body.answer }, ip });
});
