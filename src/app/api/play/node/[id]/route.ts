import { route } from "@/server/http";
import { GameError } from "@/server/engine/errors";
import { nodeDetail } from "@/server/game/engine";

export const GET = route<"team", { id: string }>({ auth: "team", event: true }, async ({ db, event, team }, { id }) => {
  const d = await nodeDetail(db, event!, team.team.id, id);
  if (!d) throw new GameError("not_found", "Challenge not found.");
  return d;
});
