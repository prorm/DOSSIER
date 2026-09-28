import { z } from "zod";
import { readJson, route } from "@/server/http";
import { AccusationInput, fileAccusation } from "@/server/engine/inquest";

const Body = z.object({ answers: AccusationInput });

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  const body = await readJson(req, Body);
  return fileAccusation(db, { event: event!, teamId: team.team.id, answers: body.answers });
});
