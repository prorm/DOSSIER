import { AnnouncementComposer, DisplayLinkPanel, EventControls } from "@/components/dossier/admin-event";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { listAnnouncements } from "@/server/engine/admin";
import { requireStaffPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Event control" };

export default async function EventControlPage() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const ev = eventView(event);
  const anns = await listAnnouncements(db, event.id, 30);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={ev.name} title="Event control">
        Every action here is broadcast live and written to the audit log.
      </PageHeader>
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
        <Panel>
          <SectionTitle>State</SectionTitle>
          <dl className="mb-4 grid grid-cols-2 gap-2 font-mono text-xs">
            <dt className="text-faint">Phase</dt>
            <dd className="uppercase">{ev.phase}</dd>
            <dt className="text-faint">Started</dt>
            <dd>{event.startedAt ? <LocalTime iso={event.startedAt} format="full" /> : "—"}</dd>
            <dt className="text-faint">Scheduled end</dt>
            <dd>{event.endsAt ? <LocalTime iso={event.endsAt} format="full" /> : "none (manual)"}</dd>
            <dt className="text-faint">Frozen</dt>
            <dd>{ev.frozen ? "yes" : "no"}</dd>
          </dl>
          <EventControls phase={ev.phase} frozen={ev.frozen} />
        </Panel>
        <Panel>
          <SectionTitle>Broadcast</SectionTitle>
          <AnnouncementComposer />
        </Panel>
        <Panel>
          <SectionTitle>Projector</SectionTitle>
          <p className="mb-3 text-sm text-ink-dim">A signed link for the big screen (no login needed on the projector machine).</p>
          <DisplayLinkPanel />
        </Panel>
        <Panel>
          <SectionTitle meta={anns.length}>Sent announcements</SectionTitle>
          {anns.length === 0 ? (
            <p className="font-mono text-xs text-faint">Nothing broadcast yet.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {anns.map((a) => (
                <li key={a.id} className="rounded-sm border border-line p-2.5">
                  <p className="flex items-center gap-2 font-mono text-sm">
                    {a.title}
                    {a.level !== "info" ? <Badge variant={a.level === "critical" ? "danger" : "warning"}>{a.level}</Badge> : null}
                    <span className="ml-auto text-[0.65rem] text-faint">
                      <LocalTime iso={a.createdAt} />
                    </span>
                  </p>
                  {a.body ? <p className="mt-1 text-sm text-ink-dim">{a.body}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
