import { z } from "zod";
import { readJson, route } from "@/server/http";
import { BoardOp, getBoard, updateBoard } from "@/server/engine/inquest";
import { GameError } from "@/server/engine/errors";
import { eventPhase } from "@/server/engine/event";

export const GET = route({ auth: "team", event: true }, async ({ db, event, team }) => getBoard(db, event!.id, team.team.id));

const Body = z.object({ ops: z.array(BoardOp).min(1).max(200) });

export const POST = route({ auth: "team", event: true }, async ({ req, db, event, team }) => {
  // The board stays editable while paused or after the end (it is private note-taking), but not before start.
  if (eventPhase(event!) === "standby") throw new GameError("event_not_live", "The case file opens when the event starts.");
  const body = await readJson(req, Body);
  return updateBoard(db, event!, team.team.id, body.ops);
});
