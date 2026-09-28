import { Trophy } from "lucide-react";

import { LeaderboardView } from "@/components/dossier/leaderboard-view";
import { PageHeader } from "@/components/dossier/primitives";
import { getLeaderboard, publicLeaderboardView } from "@/server/engine/leaderboard";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Leaderboard" };

export default async function PlayLeaderboard() {
  const { session, event, db } = await requireTeamPage("/play/leaderboard");
  const lb = publicLeaderboardView(await getLeaderboard(db, event.id, "public"));
  const ev = eventView(event);
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Trophy className="size-3.5" aria-hidden="true" /> Standings
          </>
        }
        title="Leaderboard"
      >
        Ties go to the team that reached the score first. Updates live.
      </PageHeader>
      <LeaderboardView initial={lb} myTeamId={session.team.id} modes={ev.modes} />
    </>
  );
}
