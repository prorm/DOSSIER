import { z } from "zod";
import { readJson, route } from "@/server/http";
import { purchaseHint } from "@/server/engine/play";

const Body = z.object({ challengeId: z.string().min(1).max(64), index: z.number().int().min(0).max(20) });

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  const body = await readJson(req, Body);
  return purchaseHint(db, { event: event!, teamId: team.team.id, challengeId: body.challengeId, index: body.index });
});
