import { cookies } from "next/headers";

import { PlayShell } from "@/components/dossier/play-shell";
import type { OpeningPayload } from "@/components/experience/cinematic/opening";
import { BOOT_COOKIE } from "@/lib/boot";
import { teamDressing } from "@/lib/experience/variation";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { cinematicContext, universeView } from "@/server/game/presentation";
import { requireTeamPage } from "@/server/page-auth";
import { eventView, logoUrl } from "@/server/views";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const { session, event, db, csrf } = await requireTeamPage("/play");
  const ev = eventView(event);
  const teamId = session.team.id;
  const [lb, universe] = await Promise.all([getLeaderboard(db, event.id, "public"), universeView(db, event, teamId)]);
  const me = lb.standings.find((s) => s.teamId === teamId);
  const booted = (await cookies()).get(BOOT_COOKIE)?.value === "1";

  // The opening quotes this team's real world; it is only assembled when it will actually play.
  let opening: OpeningPayload | null = null;
  if (!booted) {
    const c = await cinematicContext(db, event, teamId, session.team.name, universe);
    opening = {
      eventId: event.id,
      accent: ev.theme.accent,
      vars: {
        eventName: c.eventName,
        teamName: c.teamName,
        caseNumber: c.caseNumber,
        title: c.title,
        kicker: c.kicker,
        extraLines: c.extraLines,
        world: teamDressing(c.world).world,
        files: c.counts.total,
        open: c.counts.open,
        solved: c.counts.solved,
        acts: c.counts.acts,
        exhibits: c.counts.evidenceTotal,
        held: c.counts.evidence,
        fingerprint: c.world,
        intensity: c.intensity,
      },
    };
  }

  return (
    <>
      <meta name="csrf-token" content={csrf} />
      <PlayShell
        eventId={event.id}
        eventName={ev.name}
        codename={ev.theme.codename}
        logoUrl={logoUrl(event, session.team.id)}
        teamName={session.team.name}
        field={ev.modes.includes("live")}
        phase={ev.phase}
        frozen={ev.frozen}
        startsAt={ev.startsAt}
        disqualified={session.team.status === "disqualified" ? (session.team.statusReason ?? "") : null}
        hud={{ score: me?.score ?? 0, rank: me?.rank ?? null, teams: lb.standings.filter((s) => !s.disqualified).length }}
        universe={{ input: { nodes: universe.nodes, edges: universe.edges, acts: universe.acts }, fingerprint: universe.fingerprint, layoutSeed: universe.layoutSeed }}
        opening={opening}
        accent={ev.theme.accent}
      >
        {children}
      </PlayShell>
    </>
  );
}
