import { FolderSearch, Network } from "lucide-react";
import Link from "next/link";

import { LocalTime } from "@/components/dossier/local-time";
import { Markdown } from "@/components/dossier/markdown";
import { PageHeader } from "@/components/dossier/primitives";
import { Contradictions, Locker, People, Places, Spine } from "@/components/experience/case/case-file";
import { Button } from "@/components/ui/button";
import { caseFileView } from "@/server/game/engine";
import { presentationFingerprint } from "@/server/game/presentation";
import { requireTeamPage } from "@/server/page-auth";

export const metadata = { title: "Case file" };

/** What do I know: exhibits on the table, the people, the timeline so far, contradictions found and the places on file. */
export default async function CasePage() {
  const { session, event, db } = await requireTeamPage("/play/case");
  const f = await caseFileView(db, event, session.team.id);
  const fp = presentationFingerprint(event.id, session.team.id);
  const sections = [
    { id: "exhibits", label: "Exhibits", n: f.evidence.length },
    { id: "people", label: "People", n: f.characters.length },
    { id: "timeline", label: "Timeline", n: f.timeline.length },
    { id: "places", label: "Places", n: f.locations.length },
    ...(f.contradictions.length ? [{ id: "contradictions", label: "Contradictions", n: f.contradictions.length }] : []),
  ];
  return (
    <>
      <div className="case-head">
        <PageHeader
          eyebrow={
            <>
              <FolderSearch className="size-3.5" aria-hidden="true" /> {f.story.codename || "Case file"}
            </>
          }
          title={f.story.title}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/play/board">
                <Network /> Evidence board
              </Link>
            </Button>
          }
        >
          {f.story.premise}
        </PageHeader>
        <dl className="case-stats" aria-label="What you hold">
          <div>
            <dt>Exhibits held</dt>
            <dd className="num">{f.evidence.length}</dd>
          </div>
          <div>
            <dt>Sealed</dt>
            <dd className="num">{f.sealed}</dd>
          </div>
          <div>
            <dt>Contradictions</dt>
            <dd className="num">{f.contradictions.length}</dd>
          </div>
          <div>
            <dt>Artifacts in hand</dt>
            <dd className="num">{f.inventory.length}</dd>
          </div>
        </dl>
      </div>

      {f.solution ? (
        <section className="panel mt-6 border-[color-mix(in_srgb,var(--color-signal-green)_40%,var(--color-line))] p-5">
          <p className="label-mono !text-signal-green">{"// case solution (declassified)"}</p>
          <dl className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
            {f.solution.answers.map((a) => (
              <div key={a.field}>
                <dt className="text-mute">{a.field}</dt>
                <dd className="text-ink">{a.value}</dd>
              </div>
            ))}
          </dl>
          {f.solution.md ? <Markdown className="mt-3">{f.solution.md}</Markdown> : null}
        </section>
      ) : null}

      <nav className="case-nav" aria-label="Sections of the case file">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.label}
            <span className="num">{s.n}</span>
          </a>
        ))}
      </nav>

      <section id="exhibits" className="case-sec" aria-labelledby="exhibits-h">
        <h2 id="exhibits-h">
          Exhibits <small>{f.evidence.length} held</small>
        </h2>
        {f.evidence.length ? (
          <Locker items={f.evidence} sealed={f.sealed} fingerprint={fp} nextRelease={f.nextReleaseAt ? <LocalTime iso={f.nextReleaseAt} format="full" /> : undefined} />
        ) : (
          <p className="text-sm text-mute">The table is empty. Exhibits arrive as you solve files and make discoveries.</p>
        )}
      </section>

      <section id="people" className="case-sec" aria-labelledby="people-h">
        <h2 id="people-h">
          People <small>{f.characters.length} on file</small>
        </h2>
        <People people={f.characters} fingerprint={fp} />
      </section>

      <section id="timeline" className="case-sec" aria-labelledby="timeline-h">
        <h2 id="timeline-h">
          Timeline <small>as far as you know</small>
        </h2>
        {f.timeline.length || f.hiddenTimeline ? <Spine items={f.timeline} hidden={f.hiddenTimeline} /> : <p className="text-sm text-mute">No fixed points yet.</p>}
      </section>

      <section id="places" className="case-sec" aria-labelledby="places-h">
        <h2 id="places-h">
          Places <small>{f.locations.filter((l) => l.visited).length} visited</small>
        </h2>
        <Places places={f.locations} fingerprint={fp} />
      </section>

      {f.contradictions.length ? (
        <section id="contradictions" className="case-sec pb-6" aria-labelledby="contradictions-h">
          <h2 id="contradictions-h">
            Contradictions <small>on record</small>
          </h2>
          <Contradictions items={f.contradictions} />
        </section>
      ) : null}
    </>
  );
}
