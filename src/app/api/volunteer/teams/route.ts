import { route } from "@/server/http";
import { findTeams } from "@/server/engine/live";

export const GET = route({ auth: "staffOrStation", event: true }, async ({ req, db, event }) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return { teams: await findTeams(db, event!.id, q) };
});
