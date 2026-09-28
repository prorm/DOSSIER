import { Binary } from "lucide-react";

import { CtfBoard } from "@/components/dossier/ctf-board";
import { EmptyState, PageHeader, StandbyState } from "@/components/dossier/primitives";
import { eventPhase } from "@/server/engine/event";
import { teamChallenges } from "@/server/engine/play";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "CTF" };

export default async function CtfPage() {
  const { session, event, db } = await requireTeamPage("/play/ctf");
  const ev = eventView(event);
  if (!ev.modes.includes("ctf")) return <EmptyState title="No CTF in this event">This event does not run a capture-the-flag board.</EmptyState>;
  if (eventPhase(event) === "standby") {
    return (
      <StandbyState title="Board sealed">
        The CTF board opens when the organisers start the event. Stay on this page — it updates live.
      </StandbyState>
    );
  }
  const { views } = await teamChallenges(db, event, session.team.id, "ctf");
  const solved = views.filter((v) => v.state === "solved").length;
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Binary className="size-3.5" aria-hidden="true" /> Capture the flag
          </>
        }
        title="Flag board"
        actions={
          <span className="label-mono">
            <span className="num text-sm text-signal">{solved}</span> / {views.length} captured
          </span>
        }
      >
        Values decay on dynamic challenges as more teams solve them. First blood earns a bonus.
      </PageHeader>
      {views.length === 0 ? (
        <EmptyState title="Board empty">No CTF challenges are published yet.</EmptyState>
      ) : (
        <CtfBoard eventId={event.id} challenges={views} categories={ev.ctfCategories} />
      )}
    </>
  );
}
