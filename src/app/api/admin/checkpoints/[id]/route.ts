import { z } from "zod";
import { readJson, route } from "@/server/http";
import { rotateCheckpointToken, setCheckpointPin } from "@/server/engine/admin";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-pin"), pin: z.string().regex(/^\d{4,8}$/) }),
  z.object({ action: z.literal("rotate-qr") }),
]);

export const POST = route<"staff", { id: string }>({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }, { id }) => {
  const body = await readJson(req, Body);
  if (body.action === "set-pin") await setCheckpointPin(db, event!, id, body.pin, actor);
  else await rotateCheckpointToken(db, event!, id, actor);
  return { ok: true };
});
