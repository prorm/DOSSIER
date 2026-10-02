import { readJson, route } from "@/server/http";
import { createStudioEvent, listStudioEvents, StudioMeta } from "@/server/game/studio";

export const GET = route({ auth: "staff", role: "admin" }, async ({ db }) => ({ events: await listStudioEvents(db) }));

export const POST = route({ auth: "staff", role: "admin" }, async ({ req, db, actor }) => createStudioEvent(db, await readJson(req, StudioMeta), actor));
