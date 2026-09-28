import { z } from "zod";
import { readJson, route } from "@/server/http";
import { decideScan } from "@/server/engine/live";

const Body = z.object({ scanId: z.uuid(), approve: z.boolean(), note: z.string().max(200).optional() });

export const POST = route({ auth: "staffOrStation", event: true }, async ({ req, db, event, staff, actor }) => {
  const body = await readJson(req, Body);
  return decideScan(db, {
    event: event!,
    scanId: body.scanId,
    approve: body.approve,
    note: body.note,
    actor,
    stationCheckpoint: staff!.kind === "station" ? staff!.checkpointId : undefined,
  });
});
