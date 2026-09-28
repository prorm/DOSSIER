import { z } from "zod";
import { readJson, route } from "@/server/http";
import { markEvidenceSeen } from "@/server/engine/inquest";

const Body = z.object({ evidenceId: z.string().min(1).max(64) });

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  const body = await readJson(req, Body);
  await markEvidenceSeen(db, event!.id, team.team.id, body.evidenceId);
  return { ok: true };
});
