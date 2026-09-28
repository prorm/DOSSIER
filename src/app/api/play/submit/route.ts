import { z } from "zod";
import { readJson, route } from "@/server/http";
import { submitAnswer } from "@/server/engine/play";

const Body = z.object({ challengeId: z.string().min(1).max(64), answer: z.string().max(500) });

export const POST = route({ auth: "team", event: true }, async ({ req, db, ip, event, team }) => {
  const body = await readJson(req, Body);
  return submitAnswer(db, { event: event!, teamId: team.team.id, challengeId: body.challengeId, answer: body.answer, ip });
});
