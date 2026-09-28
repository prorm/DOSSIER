import { z } from "zod";
import { readJson, route } from "@/server/http";
import { controlEvent } from "@/server/engine/event";
import { recomputeLeaderboard } from "@/server/engine/leaderboard";

const Body = z.object({ action: z.enum(["start", "pause", "resume", "freeze", "unfreeze", "end", "reopen"]) });

export const POST = route({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }) => {
  const { action } = await readJson(req, Body);
  const updated = await controlEvent(db, event!, action, actor);
  // Freeze/unfreeze/end change the public view: recompute immediately.
  await recomputeLeaderboard(db, updated.id);
  return { status: updated.status, frozenAt: updated.frozenAt?.toISOString() ?? null };
});
