import { z } from "zod";
import { readJson, route } from "@/server/http";
import { resetTeamPassword } from "@/server/auth/accounts";
import { setTeamStatus, teamDetail } from "@/server/engine/admin";
import { GameError } from "@/server/engine/errors";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset-password") }),
  z.object({ action: z.literal("disqualify"), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("reinstate"), reason: z.string().trim().max(300).default("") }),
]);

export const GET = route<"staff", { id: string }>({ auth: "staff", role: "admin", event: true }, async ({ db, event }, { id }) => {
  const d = await teamDetail(db, event!, id);
  if (!d) throw new GameError("not_found", "Team not found.");
  return d;
});

export const POST = route<"staff", { id: string }>({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }, { id }) => {
  const body = await readJson(req, Body);
  if (body.action === "reset-password") {
    const r = await resetTeamPassword(db, event!, id, actor);
    // Shown once to the admin; never stored in clear.
    return { tempPassword: r.tempPassword, team: r.team.name };
  }
  const t = await setTeamStatus(db, event!, id, body.action === "disqualify", body.reason, actor);
  return { status: t.status };
});
