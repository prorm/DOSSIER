import { z } from "zod";
import { BoardOp } from "@/lib/board";
import { readJson, route } from "@/server/http";
import { getBoard } from "@/server/game/engine";
import { updateBoard } from "@/server/game/board";

const Body = z.object({ ops: z.array(BoardOp).max(200) });

export const GET = route({ auth: "team", event: true }, async ({ db, event, team }) => getBoard(db, event!.id, team.team.id));

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  const body = await readJson(req, Body);
  return updateBoard(db, event!, team.team.id, body.ops);
});
