import { readJson, route } from "@/server/http";
import { announce, AnnouncementInput } from "@/server/engine/admin";

export const POST = route({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }) => {
  const input = await readJson(req, AnnouncementInput);
  const a = await announce(db, event!, input, actor);
  return { id: a.id };
});
