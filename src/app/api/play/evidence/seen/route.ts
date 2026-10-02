import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { readJson, route } from "@/server/http";
import { evidenceReveals } from "@/server/db/schema";

const Body = z.object({ evidenceId: z.string().min(1).max(64) });

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  const { evidenceId } = await readJson(req, Body);
  await db
    .update(evidenceReveals)
    .set({ seenAt: new Date() })
    .where(and(eq(evidenceReveals.eventId, event!.id), eq(evidenceReveals.teamId, team.team.id), eq(evidenceReveals.evidenceId, evidenceId), isNull(evidenceReveals.seenAt)));
  return { ok: true };
});
