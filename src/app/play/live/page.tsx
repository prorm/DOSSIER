import { MapPin, MapPinned, ScanLine } from "lucide-react";

import { CheckpointMark, TeamBadge } from "@/components/dossier/live-client";
import { Markdown } from "@/components/dossier/markdown";
import { EmptyState, PageHeader, SectionTitle, StandbyState } from "@/components/dossier/primitives";
import { eventPhase } from "@/server/engine/event";
import { teamCheckpoints } from "@/server/engine/live";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Checkpoints" };

export default async function LivePage() {
  const { session, event, db } = await requireTeamPage("/play/live");
  if (!eventView(event).modes.includes("live")) return <EmptyState title="No live checkpoints">This event has no physical checkpoints.</EmptyState>;
  if (eventPhase(event) === "standby") return <StandbyState title="Stations offline">Field stations come online when the event starts.</StandbyState>;
  const cps = await teamCheckpoints(db, event, session.team.id);
  const done = cps.filter((c) => c.status === "confirmed").length;
  const points = cps.filter((c) => c.status === "confirmed").reduce((s, c) => s + c.points, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <MapPinned className="size-3.5" aria-hidden="true" /> Live
          </>
        }
        title="Field checkpoints"
        actions={
          <span className="label-mono">
            <span className="num text-sm text-signal">{done}</span>/{cps.length} cleared · <span className="num text-ink">{points}</span> pts
          </span>
        }
      >
        Find each station, scan its QR code with your phone camera, then show the volunteer your screen. Or show them your team badge.
      </PageHeader>
      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="stations">
          <SectionTitle id="stations">Stations</SectionTitle>
          <ul className="space-y-3">
            {cps.map((c) => (
              <li key={c.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-mono text-base font-semibold">{c.name}</h3>
                    {c.location ? (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-mute">
                        <MapPin className="size-3.5" aria-hidden="true" /> {c.location}
                      </p>
                    ) : null}
                  </div>
                  <span className="num text-lg font-semibold text-signal">{c.points}</span>
                </div>
                {c.instructionsMd ? <Markdown className="mt-2 text-sm">{c.instructionsMd}</Markdown> : null}
                <div className="mt-3 border-t border-line pt-3">
                  <CheckpointMark status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <TeamBadge />
          <p className="flex gap-2 font-mono text-[0.7rem] text-mute">
            <ScanLine className="size-4 shrink-0" aria-hidden="true" /> Printed station codes open straight into this app. No app install needed — your phone camera is enough.
          </p>
        </aside>
      </div>
    </>
  );
}
