import { route } from "@/server/http";
import { teamOverview } from "@/server/game/engine";

/** Command-palette index: only files the team can currently see (open/solved). */
export const GET = route({ auth: "team", event: true }, async ({ db, event, team }) => {
  const o = await teamOverview(db, event!, team.team.id);
  return {
    items: o.acts.flatMap((a) =>
      a.rounds.flatMap((r) => r.nodes.filter((n) => n.title && (n.state === "open" || n.state === "solved")).map((n) => ({ id: n.id, mode: r.family, title: n.title!, state: n.state, category: r.title }))),
    ),
  };
});
