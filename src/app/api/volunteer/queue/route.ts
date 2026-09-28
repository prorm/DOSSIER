import { route } from "@/server/http";
import { GameError } from "@/server/engine/errors";
import { getCheckpoint, listCheckpoints, stationQueue } from "@/server/engine/live";

/** Station view: the scans for this station's checkpoint. Staff pick a checkpoint via ?cp=. */
export const GET = route({ auth: "staffOrStation", event: true }, async ({ req, db, event, staff }) => {
  const cpId = staff!.kind === "station" ? staff!.checkpointId : new URL(req.url).searchParams.get("cp");
  if (!cpId) return { checkpoints: (await listCheckpoints(db, event!.id)).map((c) => ({ id: c.id, name: c.name })), queue: [] };
  const cp = await getCheckpoint(db, event!.id, cpId);
  if (!cp) throw new GameError("not_found", "Checkpoint not found.");
  const queue = await stationQueue(db, event!.id, cp.id);
  return {
    checkpoint: { id: cp.id, name: cp.name, location: cp.location, points: cp.points, requiresApproval: cp.requiresApproval },
    queue: queue.map((q) => ({ ...q, createdAt: q.createdAt.toISOString(), decidedAt: q.decidedAt?.toISOString() ?? null })),
  };
});
