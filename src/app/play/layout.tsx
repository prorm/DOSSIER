import { cookies } from "next/headers";

import { BootSequence, BOOT_COOKIE } from "@/components/dossier/boot-sequence";
import { PlayShell } from "@/components/dossier/play-shell";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { requireTeamPage } from "@/server/page-auth";
import { eventView, logoUrl } from "@/server/views";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const { session, event, db, csrf } = await requireTeamPage("/play");
  const ev = eventView(event);
  const lb = await getLeaderboard(db, event.id, "public");
  const me = lb.standings.find((s) => s.teamId === session.team.id);
  const booted = (await cookies()).get(BOOT_COOKIE)?.value === "1";
  return (
    <>
      <meta name="csrf-token" content={csrf} />
      {!booted ? <BootSequence eventName={ev.name} codename={ev.theme.codename} lines={ev.theme.bootLines} /> : null}
      <PlayShell
        eventName={ev.name}
        codename={ev.theme.codename}
        logoUrl={logoUrl(event, session.team.id)}
        teamName={session.team.name}
        modes={ev.modes}
        huntTitle={ev.hunt.title}
        phase={ev.phase}
        frozen={ev.frozen}
        startsAt={ev.startsAt}
        disqualified={session.team.status === "disqualified" ? (session.team.statusReason ?? "") : null}
        hud={{ score: me?.score ?? 0, rank: me?.rank ?? null, teams: lb.standings.filter((s) => !s.disqualified).length }}
      >
        {children}
      </PlayShell>
    </>
  );
}
