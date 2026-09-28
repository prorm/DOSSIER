import { Crosshair } from "lucide-react";

import { HuntLog, HuntMap } from "@/components/dossier/hunt-map";
import { Markdown } from "@/components/dossier/markdown";
import { EmptyState, PageHeader, SectionTitle, StandbyState } from "@/components/dossier/primitives";
import CountUp from "@/components/reactbits/CountUp";
import { Progress } from "@/components/ui/progress";
import { eventPhase } from "@/server/engine/event";
import { teamChallenges } from "@/server/engine/play";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Hunt" };

export default async function HuntPage() {
  const { session, event, db } = await requireTeamPage("/play/hunt");
  const ev = eventView(event);
  if (!ev.modes.includes("hunt")) return <EmptyState title="No hunt in this event">This event does not run a treasure hunt.</EmptyState>;
  if (eventPhase(event) === "standby") {
    return <StandbyState title="Trail not yet live">The first signal goes out when the event starts.</StandbyState>;
  }
  const { views } = await teamChallenges(db, event, session.team.id, "hunt");
  const solved = views.filter((v) => v.state === "solved").length;
  const points = views.reduce((s, v) => s + (v.state === "solved" ? v.value : 0), 0);
  const pct = views.length ? Math.round((solved / views.length) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Crosshair className="size-3.5" aria-hidden="true" /> Treasure hunt
          </>
        }
        title={ev.hunt.title}
        actions={
          <div className="flex min-w-48 flex-col gap-1.5">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="label-mono">Progress</span>
              <span>
                <span className="num text-signal">{solved}</span>
                <span className="text-mute">/{views.length} · </span>
                <CountUp to={points} className="text-ink" /> <span className="text-mute">pts</span>
              </span>
            </div>
            <Progress value={pct} aria-label={`Hunt progress ${pct}%`} />
          </div>
        }
      >
        {ev.hunt.introMd ? <Markdown className="text-sm">{ev.hunt.introMd}</Markdown> : null}
      </PageHeader>
      {views.length === 0 ? (
        <EmptyState title="No trail yet">The organisers have not published hunt nodes.</EmptyState>
      ) : (
        <div className="space-y-8">
          <HuntMap eventId={event.id} views={views} />
          <section aria-labelledby="path-log">
            <SectionTitle id="path-log" meta={`${solved}/${views.length}`}>
              Path log
            </SectionTitle>
            <HuntLog views={views} />
          </section>
        </div>
      )}
    </>
  );
}
