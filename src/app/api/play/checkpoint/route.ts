import { z } from "zod";
import { readJson, route } from "@/server/http";
import { claimCheckpoint } from "@/server/engine/live";

const Body = z.object({ token: z.string().min(10).max(1024), clientRef: z.string().max(64).optional() });

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  const body = await readJson(req, Body);
  return claimCheckpoint(db, { event: event!, teamId: team.team.id, token: body.token, clientRef: body.clientRef });
});
