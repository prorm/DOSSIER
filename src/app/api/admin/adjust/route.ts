import { readJson, route } from "@/server/http";
import { AdjustInput, adjustScore } from "@/server/engine/admin";

export const POST = route({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }) => {
  const input = await readJson(req, AdjustInput);
  await adjustScore(db, event!, input, actor);
  return { ok: true };
});
