import { z } from "zod";
import { readJson, route } from "@/server/http";
import { awardCheckpoint } from "@/server/engine/live";
import { GameError } from "@/server/engine/errors";

const Body = z
  .object({
    checkpointId: z.string().max(64).optional(),
    badge: z.string().max(1024).optional(),
    teamId: z.uuid().optional(),
    note: z.string().max(200).optional(),
  })
  .refine((b) => b.badge || b.teamId, "Scan a badge or choose a team");

export const POST = route({ auth: "staffOrStation", event: true }, async ({ req, db, event, staff, actor }) => {
  const body = await readJson(req, Body);
  const checkpointId = staff!.kind === "station" ? staff!.checkpointId : body.checkpointId;
  if (!checkpointId) throw new GameError("invalid", "Choose a checkpoint.");
  if (staff!.kind === "station" && body.checkpointId && body.checkpointId !== staff!.checkpointId)
    throw new GameError("forbidden", "This station can only award its own checkpoint.");
  return awardCheckpoint(db, { event: event!, checkpointId, actor, badge: body.badge, teamId: body.teamId, note: body.note });
});
