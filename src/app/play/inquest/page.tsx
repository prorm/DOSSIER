import { FolderSearch, Gavel, Network, Timer } from "lucide-react";
import Link from "next/link";

import { EvidenceCard, SuspectDossier, Timeline } from "@/components/dossier/case-components";
import { ChallengeCard } from "@/components/dossier/challenge-card";
import { Countdown } from "@/components/dossier/countdown";
import { Markdown } from "@/components/dossier/markdown";
import { EmptyState, PageHeader, Panel, SectionTitle, StandbyState } from "@/components/dossier/primitives";
import TextType from "@/components/reactbits/TextType";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eventPhase } from "@/server/engine/event";
import { caseFile } from "@/server/engine/inquest";
import { teamChallenges } from "@/server/engine/play";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Case File" };

const TABS = ["briefing", "evidence", "suspects", "timeline", "locations", "puzzles"] as const;

export default async function CaseFilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { session, event, db } = await requireTeamPage("/play/inquest");
  const ev = eventView(event);
  if (!ev.modes.includes("inquest")) return <EmptyState title="No inquest in this event">This event does not include a criminal inquest.</EmptyState>;
  if (eventPhase(event) === "standby") return <StandbyState title="Case file sealed">The case file is unsealed when the event starts.</StandbyState>;
  const [file, { views }] = await Promise.all([caseFile(db, event, session.team.id), teamChallenges(db, event, session.team.id, "inquest")]);
  if (!file) return <EmptyState title="No case loaded">The organisers have not loaded a story for this event.</EmptyState>;
  const active = TABS.includes(tab as (typeof TABS)[number]) ? tab! : "briefing";
  const newCount = file.evidence.filter((e) => e.isNew).length;
  const acc = file.accusation;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <FolderSearch className="size-3.5" aria-hidden="true" /> Case {file.case.codename ? `· ${file.case.codename}` : ""}
          </>
        }
        title={file.case.title}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/play/inquest/board">
                <Network /> Evidence board
              </Link>
            </Button>
            <Button asChild variant={acc.locked ? "outline" : "default"}>
              <Link href="/play/inquest/accuse">
                <Gavel /> {acc.solved ? "Verdict filed" : acc.locked ? "Verdict" : "Accuse"}
              </Link>
            </Button>
          </>
        }
      >
        {file.case.summary ? <TextType text={file.case.summary} as="p" className="font-mono text-sm text-ink" /> : null}
      </PageHeader>

      {file.solution ? (
        <Panel className="mb-6 border-[color-mix(in_srgb,var(--color-signal-amber)_45%,var(--color-line))]">
          <p className="label-mono !text-signal-amber">{"// case closed — solution declassified"}</p>
          <dl className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
            {file.solution.answers.map((a) => (
              <div key={a.field} className="flex flex-col">
                <dt className="text-xs text-mute">{a.field}</dt>
                <dd className="text-ink">{a.value}</dd>
              </div>
            ))}
          </dl>
          {file.solution.md ? <Markdown className="mt-3">{file.solution.md}</Markdown> : null}
        </Panel>
      ) : null}

      <Tabs defaultValue={active}>
        <TabsList>
          <TabsTrigger value="briefing">Briefing</TabsTrigger>
          <TabsTrigger value="evidence">
            Evidence <span className="num text-faint">{file.evidence.length}</span>
            {newCount ? <span className="ml-1 rounded-xs bg-[var(--accent-2)] px-1 text-[0.58rem] text-bg">{newCount} new</span> : null}
          </TabsTrigger>
          <TabsTrigger value="suspects">Suspects</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          {file.locations.length ? <TabsTrigger value="locations">Locations</TabsTrigger> : null}
          {views.length ? <TabsTrigger value="puzzles">Puzzles</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="briefing" className="space-y-6">
          <div className="grid items-start gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel>{file.briefingMd ? <Markdown>{file.briefingMd}</Markdown> : <p className="text-mute">No briefing.</p>}</Panel>
            <Panel as="aside" aria-labelledby="victim-h">
              <p className="label-mono">Victim</p>
              {file.victim.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.victim.image} alt={`Portrait of ${file.victim.name}`} className="mt-2 aspect-[4/5] w-full border border-line object-cover" />
              ) : null}
              <h2 id="victim-h" className="mt-3 font-mono text-base font-semibold uppercase">
                {file.victim.name}
              </h2>
              <dl className="mt-2 space-y-1 font-mono text-xs">
                {file.victim.details.map((d) => (
                  <div key={d.label} className="flex gap-2">
                    <dt className="text-faint uppercase">{d.label}</dt>
                    <dd className="text-ink-dim">{d.value}</dd>
                  </div>
                ))}
              </dl>
              {file.victim.bodyMd ? <Markdown className="mt-3 text-sm">{file.victim.bodyMd}</Markdown> : null}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          {file.nextReleaseAt || file.sealedCount ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-dashed border-line-strong px-4 py-3 font-mono text-xs text-mute">
              <span>
                <span className="text-ink">{file.sealedCount}</span> exhibit{file.sealedCount === 1 ? "" : "s"} still sealed
              </span>
              {file.nextReleaseAt ? (
                <span className="inline-flex items-center gap-2 text-signal-amber">
                  <Timer className="size-3.5" aria-hidden="true" /> Next release in <Countdown to={file.nextReleaseAt} label="Next evidence release" />
                </span>
              ) : null}
            </div>
          ) : null}
          {file.evidence.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {file.evidence.map((e, i) => (
                <li key={e.id}>
                  <EvidenceCard e={e} index={i} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No exhibits yet">Solve case puzzles to unseal evidence.</EmptyState>
          )}
        </TabsContent>

        <TabsContent value="suspects">
          <ul className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
            {file.suspects.map((s, i) => (
              <li key={s.id}>
                <SuspectDossier p={s} code={`SUS-${String(i + 1).padStart(2, "0")}`} />
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="timeline">
          <Panel>
            <Timeline items={file.timeline} hidden={file.hiddenTimelineCount} />
          </Panel>
        </TabsContent>

        <TabsContent value="locations">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {file.locations.map((l) => (
              <li key={l.id} className="panel p-4">
                <p className="label-mono">Location</p>
                <h3 className="mt-1 font-mono text-sm font-semibold">{l.name}</h3>
                {l.bodyMd ? <Markdown className="mt-2 text-sm">{l.bodyMd}</Markdown> : null}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="puzzles">
          <SectionTitle meta={`${views.filter((v) => v.state === "solved").length}/${views.length}`}>Case puzzles — each unseals evidence</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {views.map((c) => (
              <li key={c.id} className="flex [&>*]:flex-1">
                <ChallengeCard c={c} />
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </>
  );
}
