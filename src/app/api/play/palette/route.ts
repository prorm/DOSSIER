import { route } from "@/server/http";
import { teamChallenges } from "@/server/engine/play";

/** Command-palette index: only challenges the team can currently see (open/solved). */
export const GET = route({ auth: "team", event: true }, async ({ db, event, team }) => {
  const { views } = await teamChallenges(db, event!, team.team.id);
  return {
    items: views
      .filter((v) => v.state === "open" || v.state === "solved")
      .map((v) => ({ id: v.id, mode: v.mode, title: "title" in v ? v.title : v.id, state: v.state, category: v.category })),
  };
});
