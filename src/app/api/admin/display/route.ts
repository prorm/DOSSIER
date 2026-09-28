import { z } from "zod";
import { readJson, route } from "@/server/http";
import { displayToken, rotateDisplayKey } from "@/server/engine/display";
import { audit } from "@/server/audit";

const Body = z.object({ action: z.enum(["link", "revoke"]) });

/** Projector link management. `revoke` invalidates every previously issued display link. */
export const POST = route({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }) => {
  const { action } = await readJson(req, Body);
  const e = action === "revoke" ? await rotateDisplayKey(db, event!, actor) : event!;
  if (action === "link") await audit(db, actor, "display.link", { eventId: e.id });
  return { path: `/display?k=${displayToken(e)}` };
});
