import Link from "next/link";

import { LeaderboardView } from "@/components/dossier/leaderboard-view";
import { PhaseChip } from "@/components/dossier/phase";
import { EmptyState } from "@/components/dossier/primitives";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { getLeaderboard, publicLeaderboardView } from "@/server/engine/leaderboard";
import { pageTeamSession } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Leaderboard" };

/** Public scoreboard for spectators (no sign-in). Polls; frozen during a freeze. */
export default async function PublicLeaderboard() {
  const db = await getDb();
  const event = await getActiveEvent(db);
  if (!event) return <EmptyState title="No active event" className="m-6" />;
  const ev = eventView(event);
  const team = await pageTeamSession();
  const lb = publicLeaderboardView(await getLeaderboard(db, event.id, "public"));
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="label-mono hover:text-ink">
            ‹ {ev.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold uppercase">Leaderboard</h1>
        </div>
        <PhaseChip phase={ev.phase} frozen={ev.frozen} />
      </header>
      <LeaderboardView initial={lb} myTeamId={team?.team.id} modes={ev.modes} />
    </main>
  );
}
